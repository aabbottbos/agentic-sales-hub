import type { ContextFile, Finding, Severity, SkillDefinition } from "@deal-desk/context-core";
import type { RunContext, SkillImpl, SkillImplResult, SowReviewOutput } from "../types.js";

interface SowReviewInput {
  document_path: string;
}

interface ClauseRule {
  file: ContextFile;
  clauseId: string;
  topic: string;
  position: "preferred" | "acceptable" | "unacceptable";
  standardLanguage: string;
  /** byte range in the clause file of the rationale block, for the finding citation */
  citationSpan: [number, number];
  patterns: Array<{ source: string; severity: Severity }>;
}

const SEVERITY_RANK: Record<Severity, number> = { blocker: 3, major: 2, minor: 1 };

/**
 * Deterministic review-tier impl (D5). Scans a quarantined inbound document for
 * the `unacceptable_patterns` declared in each clause-library entry and emits a
 * structured Finding per distinct clause hit. No prose. No write grant — the
 * runner persists findings separately.
 */
export const sowReviewImpl: SkillImpl<SowReviewInput, SowReviewOutput> = {
  async run(
    input: SowReviewInput,
    ctx: RunContext,
    def: SkillDefinition,
  ): Promise<SkillImplResult<SowReviewOutput>> {
    const trace = [];
    const docPath = input.document_path.replaceAll("\\", "/");

    const scopeResolved = await ctx.loader.resolveScope(def.context_grants, {
      ...ctx.scopeParams,
      documentPath: docPath,
    });
    trace.push({
      step: "resolveScope",
      detail: `${scopeResolved.length} files (anchored to ${docPath})`,
    });

    const clauseFiles = await ctx.loader.readScope(def.context_grants, {
      ...ctx.scopeParams,
      documentPath: docPath,
    });
    const rules = buildClauseRules(clauseFiles);
    trace.push({ step: "loadClauses", detail: `${rules.length} clause rules` });

    // The ONLY inbound access path. Returns wrapped text; registers taint.
    const { wrapped } = await ctx.loader.readInbound(docPath);
    const rawBody = ctx.loader.extractUntrusted(wrapped);
    trace.push({
      step: "readInbound",
      detail: `${rawBody.length} chars, quarantined + taint-registered`,
    });

    const { normalized, mapToRaw } = normalizeWithMap(rawBody);
    const findings = scanBody(rawBody, normalized, mapToRaw, rules, docPath);
    trace.push({
      step: "scan",
      detail: `${findings.length} findings (${findings.filter((f) => f.severity === "blocker").length} blocker)`,
    });

    return {
      output: findings,
      scopeResolved,
      contextRead: clauseFiles.map((f) => f.path),
      trace,
    };
  },
};

function buildClauseRules(files: ContextFile[]): ClauseRule[] {
  const rules: ClauseRule[] = [];
  for (const file of files) {
    if (file.schemaType !== "clause") continue;
    const fm = file.frontmatter;
    const patterns = fm.unacceptable_patterns;
    const severityMap = (fm.pattern_severity ?? {}) as Record<string, Severity>;
    if (!Array.isArray(patterns)) continue;

    rules.push({
      file,
      clauseId: String(fm.clause_id),
      topic: String(fm.topic),
      position: fm.position as ClauseRule["position"],
      standardLanguage: String(fm.standard_language ?? ""),
      citationSpan: rationaleSpan(file.raw),
      patterns: patterns
        .filter((p): p is string => typeof p === "string")
        .map((source) => ({ source, severity: severityMap[source] ?? "major" })),
    });
  }
  return rules;
}

function rationaleSpan(raw: string): [number, number] {
  const idx = raw.indexOf("rationale:");
  if (idx < 0) {
    const end = raw.indexOf("\n---", 3);
    return [0, end > 0 ? end : Math.min(raw.length, 200)];
  }
  const after = raw.slice(idx);
  const nextKey = after.search(/\n[a-z_]+:/);
  const end = nextKey > 0 ? idx + nextKey : idx + Math.min(after.length, 400);
  return [idx, end];
}

/** Collapse whitespace runs to a single space, keeping a map from normalized index to raw index. */
export function normalizeWithMap(raw: string): {
  normalized: string;
  mapToRaw: (normIdx: number) => number;
} {
  const out: string[] = [];
  const map: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (/\s/.test(ch)) {
      out.push(" ");
      map.push(i);
      while (i < raw.length && /\s/.test(raw[i]!)) i++;
    } else {
      out.push(ch);
      map.push(i);
      i++;
    }
  }
  map.push(raw.length);
  return {
    normalized: out.join(""),
    mapToRaw: (normIdx: number) => map[Math.min(normIdx, map.length - 1)] ?? raw.length,
  };
}

/** Nearest preceding "N.N" or "N." clause number heading in the raw body. */
function nearestClause(raw: string, rawOffset: number): string {
  const before = raw.slice(0, rawOffset);
  const matches = [...before.matchAll(/(?:^|\n)#{0,3}\s*(\d+(?:\.\d+)+|\d+\.)\s/g)];
  const last = matches.at(-1);
  return last ? last[1]!.replace(/\.$/, "") : "unknown";
}

function scanBody(
  raw: string,
  normalized: string,
  mapToRaw: (n: number) => number,
  rules: ClauseRule[],
  docPath: string,
): Finding[] {
  const byLocator = new Map<string, Finding>();

  for (const rule of rules) {
    for (const pat of rule.patterns) {
      const scanner = new RegExp(pat.source, "ig");
      for (const m of normalized.matchAll(scanner)) {
        const normStart = m.index ?? 0;
        const normEnd = normStart + m[0].length;
        const rawStart = mapToRaw(normStart);
        const rawEnd = mapToRaw(normEnd);
        const locatorClause = nearestClause(raw, rawStart);
        const key = `${rule.clauseId}#${locatorClause}`;

        const candidate: Finding = {
          finding_id: "f-000",
          document: docPath,
          locator: { clause: locatorClause, span: [rawStart, rawEnd] },
          issue: `Clause ${locatorClause}: language matching "${pat.source}" violates Meridian's ${rule.topic} position (${rule.position}).`,
          severity: pat.severity,
          position: rule.position,
          citation: { path: rule.file.path, span: rule.citationSpan },
          confidence: 0.9,
        };
        if (pat.severity === "blocker" || pat.severity === "major") {
          candidate.suggested_redline = rule.standardLanguage;
        }

        const existing = byLocator.get(key);
        if (!existing || SEVERITY_RANK[pat.severity] > SEVERITY_RANK[existing.severity]) {
          byLocator.set(key, candidate);
        }
      }
    }
  }

  const findings = [...byLocator.values()].sort((a, b) => {
    const bySev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySev !== 0) return bySev;
    return a.locator.clause.localeCompare(b.locator.clause, undefined, { numeric: true });
  });
  findings.forEach((f, idx) => {
    f.finding_id = `f-${String(idx + 1).padStart(3, "0")}`;
  });
  return findings;
}
