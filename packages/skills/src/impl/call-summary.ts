import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import { normalizeNewlines } from "@agentic-sales-hub/context-core";
import type { RunContext, SkillImpl, SkillImplResult, TraceEntry } from "../types.js";
import { complete } from "./llm.js";
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";

interface CallSummaryInput {
  meeting_path: string;
}

const MODEL = "claude-sonnet-5";
// A full structured summary of a meeting note (prose recap + commitments +
// next_steps + context_deltas + citations, all as JSON) runs 3-5k tokens on the
// corpus notes. 2048 truncated mid-object; 6144 leaves headroom.
const MAX_TOKENS = 6144;

/**
 * Extract the first balanced top-level JSON object from a model response. The
 * prompt asks for bare JSON; this tolerates the model wrapping it in a sentence
 * or a code fence.
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

interface RawCitation {
  path?: unknown;
  quote?: unknown;
}

/**
 * Resolve a model citation `{path, quote}` to `{path, quote, span}` by locating
 * the quote verbatim in the note. The model cannot count byte offsets (spec 002
 * OQ7), so it returns exact substrings and the skill computes the span.
 *
 * Matching is tried against the raw note first, then a whitespace-insensitive
 * pattern (models sometimes collapse runs of spaces/newlines when quoting).
 * Returns null if the quote cannot be located.
 */
function resolveCitationSpan(
  raw: string,
  cit: RawCitation,
): { path: string; quote: string; span: [number, number] } | null {
  if (typeof cit.path !== "string" || typeof cit.quote !== "string" || cit.quote.length === 0) {
    return null;
  }
  const quote = normalizeNewlines(cit.quote);

  const direct = raw.indexOf(quote);
  if (direct >= 0) {
    return { path: cit.path, quote, span: [direct, direct + quote.length] };
  }

  // Whitespace-insensitive fallback: every run of whitespace in the quote
  // matches any run of whitespace in the note.
  const pattern = quote
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const found = new RegExp(pattern).exec(raw);
  if (found) {
    return { path: cit.path, quote: found[0], span: [found.index, found.index + found[0].length] };
  }
  return null;
}

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

    const responseText = await complete({
      system: buildSystemPrompt(),
      user: buildUserPrompt(meetingPath, noteText),
      model: MODEL,
      maxTokens: MAX_TOKENS,
    });
    trace.push({ step: "model", detail: `${responseText.length} chars returned` });

    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      throw new Error("call-summary: model did not return valid JSON");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("call-summary: model did not return valid JSON");
    }

    // Turn each model citation {path, quote} into {path, quote, span} by locating
    // the quote in the note. A quote that cannot be located verbatim is a
    // fabricated citation: keep its shape but give it an out-of-range span so it
    // fails the citation-validity gate (rather than crashing the run). That is
    // the honest outcome — the claim was not actually supported.
    const badSpan: [number, number] = [noteText.length, noteText.length + 1];
    let unlocatable = 0;
    const fixCitation = (
      raw: RawCitation,
    ): { path: string; quote: string; span: [number, number] } => {
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
            item.citation = fixCitation((item.citation ?? {}) as RawCitation);
          }
        }
      }
      if (Array.isArray(p.citations)) {
        p.citations = (p.citations as RawCitation[]).map(fixCitation);
      }
    }
    if (unlocatable) {
      trace.push({
        step: "citations",
        detail: `${unlocatable} model quote(s) not found verbatim in note`,
      });
    }

    const check = validateSummaryOutput(parsed);
    if (!check.valid) {
      throw new Error(
        `call-summary: output failed schema — ${check.errors.slice(0, 5).join("; ")}`,
      );
    }

    return {
      output: parsed as SummaryOutput,
      scopeResolved,
      contextRead: [meetingPath],
      trace,
    };
  },
};
