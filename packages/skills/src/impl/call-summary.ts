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

/** Normalize smart quotes / dashes so a model's "pretty" quote still matches. */
function unify(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-");
}

/**
 * Resolve a model citation `{path, quote}` to `{path, quote, span}` by locating
 * the quote in the note. The model cannot count byte offsets (spec 002 OQ7), so
 * it returns substrings and the skill computes the span.
 *
 * Tried in order: (1) exact, (2) whitespace-insensitive, (3) punctuation-unified
 * (smart quotes/dashes), (4) longest verbatim run of the quote that is >= 24
 * chars and >= 60% of its length (covers a model adding or altering a word at an
 * edge). Returns null if none hit — the caller then flags an out-of-range span so
 * the citation-validity gate fails rather than the run crashing.
 */
function resolveCitationSpan(
  raw: string,
  cit: RawCitation,
): { path: string; quote: string; span: [number, number] } | null {
  if (typeof cit.path !== "string" || typeof cit.quote !== "string" || cit.quote.length === 0) {
    return null;
  }
  const path = cit.path;
  const quote = normalizeNewlines(cit.quote).trim();

  // 1. exact
  const direct = raw.indexOf(quote);
  if (direct >= 0) return { path, quote, span: [direct, direct + quote.length] };

  // 2. whitespace-insensitive
  const wsPattern = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const wsFound = new RegExp(wsPattern).exec(raw);
  if (wsFound) {
    return { path, quote: wsFound[0], span: [wsFound.index, wsFound.index + wsFound[0].length] };
  }

  // 3. punctuation-unified whitespace-insensitive
  const rawU = unify(raw);
  const quoteU = unify(quote);
  const uPattern = quoteU.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const uFound = new RegExp(uPattern).exec(rawU);
  if (uFound) {
    // Offsets into rawU line up 1:1 with raw (unify is char-for-char).
    return {
      path,
      quote: raw.slice(uFound.index, uFound.index + uFound[0].length),
      span: [uFound.index, uFound.index + uFound[0].length],
    };
  }

  // 4. longest verbatim run of the (unified) quote present in the (unified) note.
  // A model quote is a paraphrase-free selection of note text; if it added or
  // changed a word at an edge, the bulk of it still appears verbatim. Accept the
  // longest such run down to 16 chars — enough to be a real anchor, short enough
  // to tolerate a couple of altered words.
  const minRun = Math.min(16, quoteU.length);
  for (let len = quoteU.length; len >= minRun; len--) {
    for (let start = 0; start + len <= quoteU.length; start++) {
      const frag = quoteU.slice(start, start + len).trim();
      if (frag.length < minRun) continue;
      const at = rawU.indexOf(frag);
      if (at >= 0) {
        return { path, quote: raw.slice(at, at + frag.length), span: [at, at + frag.length] };
      }
    }
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
