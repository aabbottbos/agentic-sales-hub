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
