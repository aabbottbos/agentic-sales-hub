import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import { loadSkill } from "./registry.js";
import { callPrepImpl } from "./impl/call-prep.js";
import { callSummaryImpl } from "./impl/call-summary.js";
import { findEvidenceImpl } from "./impl/find-evidence.js";
import { sowReviewImpl } from "./impl/sow-review.js";
import { validateSummaryOutput } from "./impl/summary-schema.js";
import { validateBriefOutput } from "./impl/brief-schema.js";
import type { RunContext, SkillImpl, SkillRunResult } from "./types.js";

const IMPLS: Record<string, SkillImpl> = {
  "call-prep": callPrepImpl as unknown as SkillImpl,
  "call-summary": callSummaryImpl as unknown as SkillImpl,
  "find-evidence": findEvidenceImpl as unknown as SkillImpl,
  "sow-review": sowReviewImpl as unknown as SkillImpl,
};

/**
 * Dispatch generation-output schema validation by `def.output.schema`. Both
 * summary-output.json (call-summary) and brief-output.json (call-prep) stay
 * in-package-validated (spec 002 OQ5 precedent) — this is the schema-path
 * lookup that picks between them, not a new validation mechanism.
 */
function validateGenerationOutput(
  schemaPath: string,
  output: unknown,
): { valid: boolean; errors: string[] } {
  if (schemaPath.endsWith("summary-output.json")) return validateSummaryOutput(output);
  if (schemaPath.endsWith("brief-output.json")) return validateBriefOutput(output);
  throw new Error(`runSkill: no in-package validator registered for output.schema "${schemaPath}"`);
}

/** Validate raw input against a skill definition's `inputs`. Throws on mismatch. */
export function validateInput(
  def: SkillDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(def.inputs)) {
    const present = name in input && input[name] !== undefined;
    if (!present) {
      if (spec.required) throw new Error(`skill ${def.id}: missing required input "${name}"`);
      continue;
    }
    const value = input[name];
    const actual = typeof value;
    if (actual !== spec.type) {
      throw new Error(`skill ${def.id}: input "${name}" expected ${spec.type}, got ${actual}`);
    }
    if (spec.enum && typeof value === "string" && !spec.enum.includes(value)) {
      throw new Error(`skill ${def.id}: input "${name}" must be one of ${spec.enum.join(", ")}`);
    }
    out[name] = value;
  }
  // reject unknown inputs
  for (const key of Object.keys(input)) {
    if (!(key in def.inputs) && input[key] !== undefined) {
      throw new Error(`skill ${def.id}: unknown input "${key}"`);
    }
  }
  return out;
}

/**
 * Run a skill: load its definition, validate input, dispatch to the impl, then
 * enforce the output contract (schema + `requires_citations`).
 *
 * Grant enforcement: the impl receives the loader and MUST resolve its scope
 * through it. `runSkill` additionally checks that every file the impl reports as
 * read is within the resolved scope.
 */
export async function runSkill(
  id: string,
  input: Record<string, unknown>,
  ctx: RunContext,
): Promise<SkillRunResult> {
  const def = await loadSkill(id);
  const impl = IMPLS[id];
  if (!impl) throw new Error(`no implementation registered for skill "${id}"`);

  const validated = validateInput(def, input);
  const result = await impl.run(validated, ctx, def);

  // Grant enforcement: nothing read outside the resolved scope.
  const scopeSet = new Set(result.scopeResolved);
  for (const readPath of result.contextRead) {
    if (!scopeSet.has(readPath)) {
      throw new Error(`skill ${id} read ${readPath} which is outside its resolved context scope`);
    }
  }

  // Output contract.
  let citationsValid: boolean | undefined;
  if (def.tier === "retrieval") {
    ctx.loader.assertValidRetrievalResult(
      result.output as Parameters<typeof ctx.loader.assertValidRetrievalResult>[0],
    );
    if (def.output.requires_citations) {
      citationsValid = await checkRetrievalCitations(ctx, result.output as RetrievalLike[]);
    }
  } else if (def.tier === "review") {
    const findings = result.output as ReviewFinding[];
    validateFindings(ctx, findings);
    if (def.output.requires_citations) {
      citationsValid = await checkFindingCitations(ctx, findings);
    }
  } else if (def.tier === "generation") {
    const check = validateGenerationOutput(def.output.schema, result.output);
    if (!check.valid) {
      throw new Error(
        `${id} output does not satisfy ${def.output.schema}: ${check.errors.slice(0, 5).join("; ")}`,
      );
    }
    if (def.output.requires_citations) {
      citationsValid = await checkGenerationCitations(ctx, result.output);
    }
  }

  let artifactPath: string | undefined;
  if (def.tier === "generation" && def.context_grants.write?.length) {
    if (citationsValid === false) {
      throw new Error(
        `${id}: refusing to persist — citation validity check failed; ` +
          `writeArtifact() is not called for output whose citations do not resolve`,
      );
    }
    const rendered = renderArtifactBody(id, result.output);
    const written = await ctx.loader.writeArtifact({
      accountSlug: mustParam(ctx.scopeParams.accountSlug, "accountSlug"),
      crmId: mustParam(ctx.scopeParams.oppId, "crmId/oppId"),
      kind: artifactKindFor(id),
      generatedBy: id,
      title: rendered.title,
      body: rendered.body,
      citations: rendered.citations,
      unsourcedClaims: rendered.unsourcedClaims,
    });
    artifactPath = written.artifactPath;
  }

  return {
    skillId: id,
    version: def.version,
    output: result.output,
    scopeResolved: result.scopeResolved,
    contextRead: result.contextRead,
    ...(citationsValid !== undefined ? { citationsValid } : {}),
    ...(artifactPath !== undefined ? { artifactPath } : {}),
    trace: result.trace,
  };
}

interface RetrievalLike {
  path: string;
  span: [number, number];
}

interface ReviewFinding {
  finding_id: string;
  severity: "blocker" | "major" | "minor";
  position: "preferred" | "acceptable" | "unacceptable";
  citation: { path: string; span: [number, number] };
}

interface CitationRef {
  path: string;
  span: [number, number];
  quote?: string;
}

function isCitationShaped(v: unknown): v is CitationRef {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.path === "string" &&
    Array.isArray(o.span) &&
    o.span.length === 2 &&
    typeof o.span[0] === "number" &&
    typeof o.span[1] === "number"
  );
}

function citationKey(c: CitationRef): string {
  return `${c.path}::${c.span[0]}::${c.span[1]}`;
}

/**
 * Generalized citation-flattening for any generation-tier output that already
 * passed its own output-contract schema validation (spec 004 JC5). Walks
 * every own enumerable property of `output`:
 *   - an array field is a "citation carrier" if it is `citations` by name
 *     (the one field every generation output-contract schema requires,
 *     possibly empty), OR any of its items are citation-shaped directly, OR
 *     any of its items carry a citation-shaped `.citation` property.
 *   - a non-array property, or an array of plain strings (e.g.
 *     `unsourced_claims`), is silently skipped.
 *
 * FAILS CLOSED: if NO array field is recognized as a citation carrier at all
 * (not even an empty, correctly-named `citations` field), throws — a
 * schema-valid-but-structurally-unwalkable output is a runner assertion
 * failure, not a silent empty set. Likewise an item whose `.citation`
 * property exists but is malformed throws rather than being skipped, since
 * schema validation should already have caught that shape.
 *
 * A legitimately citation-free output (every claim marked [unsourced], so
 * every item array and the top-level `citations` are empty) does NOT throw:
 * the presence of the `citations` key as an array, empty or not, is itself
 * sufficient evidence of a walkable shape.
 */
function flattenCitations(output: unknown): CitationRef[] {
  if (typeof output !== "object" || output === null) {
    throw new Error("flattenCitations: output is not an object");
  }
  const record = output as Record<string, unknown>;
  const seen = new Map<string, CitationRef>();
  // DELIBERATE: seeds foundCarrierField from the mere presence (and array-ness)
  // of a top-level `citations` field, BEFORE the per-item loop below runs. An
  // empty `citations: []` (the legitimately-citation-free case — every claim
  // is [unsourced]) has no items for the loop to iterate, so the loop alone
  // would never flip this to true; without this seed, an honest all-unsourced
  // brief would incorrectly throw the "no citation-shaped field" error below.
  // Do not simplify this away.
  let foundCarrierField = Array.isArray(record.citations);

  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      if (isCitationShaped(item)) {
        foundCarrierField = true;
        seen.set(citationKey(item), item);
        continue;
      }
      if (typeof item === "object" && item !== null && "citation" in item) {
        const c = (item as { citation: unknown }).citation;
        if (!isCitationShaped(c)) {
          throw new Error(
            `flattenCitations: field "${key}" has an item with a malformed .citation ` +
              `(expected {path: string, span: [number, number]}) after output already ` +
              `passed schema validation — this is a runner/schema mismatch, not a model error`,
          );
        }
        foundCarrierField = true;
        seen.set(citationKey(c), c);
      }
      // else: a plain array item (e.g. a string in unsourced_claims) — skip.
    }
  }

  if (!foundCarrierField) {
    throw new Error(
      "flattenCitations: found no citation-shaped field anywhere in output " +
        "(no top-level citations[] array and no array items carrying a .citation) — " +
        "refusing to report an empty citation set as valid",
    );
  }

  return [...seen.values()];
}

export { flattenCitations };

async function checkRetrievalCitations(ctx: RunContext, hits: RetrievalLike[]): Promise<boolean> {
  for (const hit of hits) {
    try {
      await ctx.loader.resolveCitation({ path: hit.path, span: hit.span });
    } catch {
      return false;
    }
  }
  return true;
}

/** Generation citation validity = resolve-only over the flattened citation set. */
async function checkGenerationCitations(ctx: RunContext, output: unknown): Promise<boolean> {
  for (const c of flattenCitations(output)) {
    try {
      await ctx.loader.resolveCitation({ path: c.path, span: c.span });
    } catch {
      return false;
    }
  }
  return true;
}

function mustParam(v: string | undefined, name: string): string {
  if (!v) throw new Error(`runSkill: missing scopeParams.${name}, required to persist an artifact`);
  return v;
}

function artifactKindFor(skillId: string): string {
  if (skillId === "call-prep") return "brief";
  throw new Error(`runSkill: no artifact kind mapping for generation skill "${skillId}"`);
}

interface RenderedArtifact {
  title: string;
  body: string;
  citations: { claim: string; path: string; span: [number, number] }[];
  unsourcedClaims: string[];
}

interface BriefOutputLike {
  goal: string;
  what_we_know: { text: string; citation: { path: string; span: [number, number] } }[];
  talking_points: { text: string; citation: { path: string; span: [number, number] } }[];
  risks: { text: string; citation: { path: string; span: [number, number] } }[];
  citations: { path: string; span: [number, number] }[];
  unsourced_claims: string[];
}

/** Renders a call-prep BriefOutput into an artifact body + flattened
 *  frontmatter citations (claim = the item's text). Mirrors exactly what
 *  write-findings.ts's renderFindingsArtifact already does for sow-review;
 *  artifact.json's citation shape ({claim, path, span}) is NOT touched by
 *  this slice — this is the mapping step from brief-output.json's runtime
 *  shape ({path, quote, span}) to it. */
function renderCallPrepBody(output: BriefOutputLike): RenderedArtifact {
  const citations: RenderedArtifact["citations"] = [];
  const section = (title: string, items: BriefOutputLike["what_we_know"]): string => {
    if (items.length === 0) return "";
    const lines = items.map((it) => {
      citations.push({ claim: it.text, path: it.citation.path, span: it.citation.span });
      return `- ${it.text}`;
    });
    return `\n## ${title}\n\n${lines.join("\n")}\n`;
  };
  for (const c of output.citations) {
    citations.push({ claim: "(overall source)", path: c.path, span: c.span });
  }
  const body = [
    "# Call-prep brief",
    "",
    output.goal,
    section("What we know", output.what_we_know),
    section("Talking points", output.talking_points),
    section("Risks", output.risks),
  ].join("\n");
  return { title: "Call-prep brief", body, citations, unsourcedClaims: output.unsourced_claims };
}

function renderArtifactBody(skillId: string, output: unknown): RenderedArtifact {
  if (skillId === "call-prep") return renderCallPrepBody(output as BriefOutputLike);
  throw new Error(`runSkill: no artifact renderer for generation skill "${skillId}"`);
}

function validateFindings(ctx: RunContext, findings: ReviewFinding[]): void {
  for (const [i, f] of findings.entries()) {
    const res = ctx.loader.registry.get("finding")(f);
    if (!res) {
      throw new Error(`sow-review output findings[${i}] does not satisfy finding.json`);
    }
  }
}

async function checkFindingCitations(ctx: RunContext, findings: ReviewFinding[]): Promise<boolean> {
  for (const f of findings) {
    const verdict = await ctx.loader.verifyCitation(f.citation, {
      kind: "position",
      position: f.position,
    });
    if (!verdict.valid) return false;
  }
  return true;
}
