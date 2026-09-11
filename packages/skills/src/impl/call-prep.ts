import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import type { RunContext, SkillImpl, SkillImplResult, TraceEntry } from "../types.js";
import { complete } from "./llm.js";
import { buildSystemPrompt, buildUserPrompt, type ContextFile } from "./call-prep.prompt.js";
import { validateBriefOutput, type BriefOutput } from "./brief-schema.js";
import { resolveCitationSpan, type RawCitation } from "./citation-span.js";

interface CallPrepInput {
  account_slug: string;
  opp_id: string;
  meeting_context?: string;
}

const MODEL = "claude-sonnet-5";
// call-prep synthesizes across the whole opportunity's context (every in-scope
// file, not one note), so the return object tends to run larger than
// call-summary's single-document summary. Same shape of budget, more headroom.
const MAX_TOKENS = 6144;

/**
 * Extract the first balanced top-level JSON object from a model response. The
 * prompt asks for bare JSON; this tolerates the model wrapping it in a sentence
 * or a code fence.
 *
 * Duplicated from call-summary.ts rather than imported: it is a private,
 * unexported helper there, and per the task instructions call-summary.ts is not
 * to be touched in this slice. If a third generation skill needs this later,
 * that is the point to extract it to a shared module (same argument that moved
 * `resolveCitationSpan` into citation-span.ts) — not a decision to make
 * unilaterally on a two-instance precedent alone.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * LLM-backed generation-tier impl (spec 002 / plan 004). Unlike call-summary
 * (one anchored note in, one summary out), call-prep's read grant is a set of
 * glob patterns with no single anchor document — it reads the opportunity's
 * entire resolved scope (meetings, the opportunity record, prior artifacts,
 * account/people records, org evidence, ICP material) into one prompt and asks
 * the model to synthesize a call-prep brief. Persists nothing (that is Task 8);
 * this impl returns structured output only.
 */
export const callPrepImpl: SkillImpl<CallPrepInput, BriefOutput> = {
  async run(
    input: CallPrepInput,
    ctx: RunContext,
    def: SkillDefinition,
  ): Promise<SkillImplResult<BriefOutput>> {
    const trace: TraceEntry[] = [];
    const accountSlug = input.account_slug;
    const oppId = input.opp_id;

    // No `documentPath` anchor: the grant is a multi-glob read, not one named
    // file. resolveScope needs only {accountSlug, oppId} to substitute every
    // {account}/{opp} placeholder across the 7 read globs.
    const scopeResolved = await ctx.loader.resolveScope(def.context_grants, {
      ...ctx.scopeParams,
      accountSlug,
      oppId,
    });
    trace.push({ step: "resolveScope", detail: `${scopeResolved.length} files` });

    // Read every file the scope resolved to — call-prep genuinely synthesizes
    // across all of it, unlike call-summary's single anchored document.
    const files: ContextFile[] = [];
    for (const path of scopeResolved) {
      const file = await ctx.loader.read(path);
      files.push({ path, raw: file.raw });
    }
    trace.push({
      step: "readScope",
      detail: `${files.length} files, ${files.reduce((n, f) => n + f.raw.length, 0)} chars total`,
    });

    // path -> raw text, for citation resolution below. Each citation must be
    // checked against the SPECIFIC file it claims to come from, not a single
    // shared note — call-prep's citations can point at any file in scope.
    const rawByPath = new Map(files.map((f) => [f.path, f.raw]));

    // Turn each model citation {path, quote} into {path, quote, span} by
    // locating the quote in the file it claims to be from. Two ways a citation
    // can be unresolvable, both handled the same honest way — a shaped-but-
    // out-of-range span, so the citation fails the validity gate rather than
    // the run crashing or silently attributing the quote to the wrong file:
    //   1. path names a file that was never read (hallucinated path)
    //   2. path is valid but the quote isn't a verbatim substring of it
    const fixCitations = (parsed: unknown): number => {
      let unlocatable = 0;
      const fix = (raw: RawCitation): { path: string; quote: string; span: [number, number] } => {
        const path = typeof raw.path === "string" ? raw.path : "(unknown path)";
        const quote = typeof raw.quote === "string" && raw.quote.length ? raw.quote : "(no quote)";
        const sourceText = rawByPath.get(path);
        const resolved = sourceText !== undefined ? resolveCitationSpan(sourceText, raw) : null;
        if (resolved) return resolved;
        unlocatable++;
        // Out-of-range relative to the claimed source file when we have one
        // (or a length-1 file's worth of text as a stand-in when we don't) —
        // either way, entirely outside any real span, so it cannot coincide
        // with a valid resolution.
        const len = sourceText?.length ?? 0;
        return { path, quote, span: [len, len + 1] };
      };
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        for (const key of ["what_we_know", "talking_points", "risks"] as const) {
          if (Array.isArray(p[key])) {
            for (const item of p[key] as { citation?: unknown }[]) {
              item.citation = fix((item.citation ?? {}) as RawCitation);
            }
          }
        }
        if (Array.isArray(p.citations)) {
          p.citations = (p.citations as RawCitation[]).map(fix);
        }
      }
      return unlocatable;
    };

    // The model occasionally returns a truncated response, non-JSON, or JSON
    // that misses the contract. None of these are API errors, so the seam's own
    // retry does not catch them — retry the whole generate -> parse -> validate
    // a few times before giving up. A persistent failure is a real problem and
    // throws.
    const MAX_GEN_ATTEMPTS = 3;
    let output: BriefOutput | null = null;
    let lastError = "unknown";
    for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
      const responseText = await complete({
        system: buildSystemPrompt(),
        user: buildUserPrompt(accountSlug, oppId, input.meeting_context, files),
        model: MODEL,
        maxTokens: MAX_TOKENS,
      });

      const jsonText = extractJsonObject(responseText);
      let parsed: unknown;
      if (jsonText) {
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          parsed = undefined;
        }
      }
      if (parsed === undefined) {
        lastError = `unparseable output (${responseText.length} chars)`;
      } else {
        const unlocatable = fixCitations(parsed);
        const check = validateBriefOutput(parsed);
        if (check.valid) {
          output = parsed as BriefOutput;
          trace.push({
            step: "model",
            detail: `parsed + validated on attempt ${attempt}${
              unlocatable ? `; ${unlocatable} quote(s) not found in named file` : ""
            }`,
          });
          break;
        }
        lastError = `schema — ${check.errors.slice(0, 3).join("; ")}`;
      }

      if (attempt < MAX_GEN_ATTEMPTS) {
        trace.push({ step: "model", detail: `attempt ${attempt} failed (${lastError}); retrying` });
      }
    }

    if (!output) {
      throw new Error(
        `call-prep: no valid output after ${MAX_GEN_ATTEMPTS} attempts (last: ${lastError})`,
      );
    }

    return {
      output,
      scopeResolved,
      contextRead: scopeResolved,
      trace,
    };
  },
};
