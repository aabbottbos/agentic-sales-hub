import { normalizeNewlines } from "@agentic-sales-hub/context-core";

/** Shared quote-to-span citation resolution, used by call-summary and call-prep. */

export interface RawCitation {
  path?: unknown;
  quote?: unknown;
}

export interface ResolvedSpanCitation {
  path: string;
  quote: string;
  span: [number, number];
}

/** Normalize smart quotes / dashes so a model's "pretty" quote still matches. */
export function unify(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-");
}

/**
 * Resolve a model citation `{path, quote}` to `{path, quote, span}` by locating
 * the quote in the source text. The model cannot count byte offsets (spec 002
 * OQ7), so it returns substrings and the skill computes the span.
 *
 * Tried in order: (1) exact, (2) whitespace-insensitive, (3) punctuation-unified
 * (smart quotes/dashes), (4) longest verbatim run of the quote, down to
 * `minRun = min(16, quote length)` (no percentage floor — covers a model adding
 * or altering a word at an edge). Returns null if none hit — the caller then
 * flags an out-of-range span so the citation-validity gate fails rather than the
 * run crashing.
 */
export function resolveCitationSpan(raw: string, cit: RawCitation): ResolvedSpanCitation | null {
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

  // 4. longest verbatim run of the (unified) quote present in the (unified) source text.
  // A model quote is a paraphrase-free selection of source text; if it added or
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

/** A citation whose quote `resolveCitationSpan` could not locate in its named file. */
export interface UnlocatedQuote {
  path: string;
  quote: string;
}

const FEEDBACK_MAX_QUOTES = 10;
const FEEDBACK_MAX_QUOTE_CHARS = 200;

/**
 * Feedback appended to the user prompt for the one regeneration a skill makes
 * when its output cites quotes that aren't verbatim in the named file (plan
 * 009). Deterministic: the same failures produce the same text.
 */
export function misquoteFeedback(failed: UnlocatedQuote[]): string {
  const shown = failed.slice(0, FEEDBACK_MAX_QUOTES).map((f) => {
    const q =
      f.quote.length > FEEDBACK_MAX_QUOTE_CHARS
        ? `${f.quote.slice(0, FEEDBACK_MAX_QUOTE_CHARS)}…`
        : f.quote;
    return `- ${f.path}: ${JSON.stringify(q)}`;
  });
  const more =
    failed.length > FEEDBACK_MAX_QUOTES
      ? [`- …and ${failed.length - FEEDBACK_MAX_QUOTES} more`]
      : [];
  return [
    "Your previous answer cited these quotes, which do not appear verbatim in the file named:",
    ...shown,
    ...more,
    "",
    "Re-answer in full. Every `quote` must be copied exactly, as one contiguous passage from that one file — never join text from two places. If no exact passage supports a claim, move it to `unsourced_claims`.",
  ].join("\n");
}
