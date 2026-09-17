import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import type { RunContext, SkillImpl, SkillImplResult, TraceEntry } from "../types.js";
import { complete } from "./llm.js";
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";
import { resolveCitationSpan, type RawCitation } from "./citation-span.js";
import { extractJsonObject } from "./json-extract.js";

interface CallSummaryInput {
  meeting_path: string;
}

const MODEL = "claude-sonnet-5";
// A full structured summary of a meeting note (prose recap + commitments +
// next_steps + context_deltas + citations, all as JSON) runs 3-5k tokens on the
// corpus notes. 2048 truncated mid-object; 6144 leaves headroom.
const MAX_TOKENS = 6144;

/**
 * LLM-backed generation-tier impl (spec 002). Reads exactly one corpus meeting
 * note, asks the model for a structured summary, validates the return against
 * `summary-output.json`. Persists nothing (that is WI-2). Model portability is a
 * v1 non-goal — the call goes through the single `complete` seam.
 */
export const callSummaryImpl: SkillImpl<CallSummaryInput, SummaryOutput> = {
  async run(
    input: CallSummaryInput,
    ctx: RunContext,
    def: SkillDefinition,
  ): Promise<SkillImplResult<SummaryOutput>> {
    const trace: TraceEntry[] = [];
    const meetingPath = input.meeting_path.replaceAll("\\", "/");

    // Resolve the skill's read grant, anchored to the requested note. `resolveScope`
    // itself throws ScopeViolationError if the path is outside the grant globs.
    const scopeResolved = await ctx.loader.resolveScope(def.context_grants, {
      ...ctx.scopeParams,
      documentPath: meetingPath,
    });
    trace.push({
      step: "resolveScope",
      detail: `${scopeResolved.length} files (anchored to ${meetingPath})`,
    });

    // Read the one note through the loader. `file.raw` is the whole file,
    // frontmatter included, LF-normalized — the exact basis `resolveCitation`
    // slices, so the model's [start, end) offsets resolve without conversion.
    const file = await ctx.loader.read(meetingPath);
    const noteText = file.raw;
    trace.push({ step: "readNote", detail: `${noteText.length} chars` });

    // Turn each model citation {path, quote} into {path, quote, span} by locating
    // the quote in the note. A quote that cannot be located verbatim keeps its
    // shape but gets an out-of-range span so it fails the citation-validity gate
    // — the honest outcome, the claim was not actually supported.
    const badSpan: [number, number] = [noteText.length, noteText.length + 1];
    const fixCitations = (parsed: unknown): number => {
      let unlocatable = 0;
      const fix = (raw: RawCitation): { path: string; quote: string; span: [number, number] } => {
        const resolved = resolveCitationSpan(noteText, raw);
        if (resolved) return resolved;
        unlocatable++;
        return {
          path: typeof raw.path === "string" ? raw.path : meetingPath,
          quote: typeof raw.quote === "string" && raw.quote.length ? raw.quote : "(no quote)",
          span: badSpan,
        };
      };
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        for (const key of ["commitments", "next_steps", "context_deltas"] as const) {
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

    // The model occasionally returns a truncated response, non-JSON, or JSON that
    // misses the contract (a stray key on a context_delta, etc.). None of these
    // are API errors, so the seam's own retry does not catch them — retry the
    // whole generate → parse → validate a few times before giving up. A
    // persistent failure is a real problem and throws.
    const MAX_GEN_ATTEMPTS = 3;
    let output: SummaryOutput | null = null;
    let lastError = "unknown";
    for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
      const responseText = await complete({
        system: buildSystemPrompt(),
        user: buildUserPrompt(meetingPath, noteText),
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
        const check = validateSummaryOutput(parsed);
        if (check.valid) {
          output = parsed as SummaryOutput;
          trace.push({
            step: "model",
            detail: `parsed + validated on attempt ${attempt}${
              unlocatable ? `; ${unlocatable} quote(s) not found in note` : ""
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
        `call-summary: no valid output after ${MAX_GEN_ATTEMPTS} attempts (last: ${lastError})`,
      );
    }

    return {
      output,
      scopeResolved,
      contextRead: [meetingPath],
      trace,
    };
  },
};
