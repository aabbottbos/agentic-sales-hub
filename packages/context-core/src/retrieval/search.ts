import type { ContextFile, RetrievalHit } from "../types.js";

/**
 * Deterministic BM25-lite ranking over a fixed scope. No embeddings, no network.
 * A lexical baseline, honest as such, swapped for a real ranking layer in Phase 1
 * with no contract change.
 *
 * `search` NEVER widens the scope it is given: it only ranks `scope`.
 */

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "at",
  "by",
  "as",
  "it",
  "this",
  "that",
  "from",
  "we",
  "our",
  "you",
  "your",
  "they",
  "their",
  "i",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Frontmatter string values worth extra weight. */
const BOOSTED_KEYS = new Set(["title", "summary", "situation", "solution", "topic", "tags"]);

function frontmatterText(fm: Record<string, unknown>): { plain: string; boosted: string } {
  const plain: string[] = [];
  const boosted: string[] = [];
  for (const [k, v] of Object.entries(fm)) {
    const flat =
      typeof v === "string"
        ? v
        : Array.isArray(v)
          ? v.filter((x) => typeof x === "string").join(" ")
          : "";
    if (!flat) continue;
    if (BOOSTED_KEYS.has(k)) boosted.push(flat);
    else plain.push(flat);
  }
  return { plain: plain.join(" "), boosted: boosted.join(" ") };
}

interface Paragraph {
  start: number;
  end: number;
  tokens: Set<string>;
}

interface Doc {
  file: ContextFile;
  /** token -> frequency (boosted frontmatter tokens counted twice). */
  tf: Map<string, number>;
  length: number;
  paragraphs: Paragraph[];
}

function splitParagraphs(body: string, bodyOffset: number): Paragraph[] {
  const out: Paragraph[] = [];
  const separator = /\n\s*\n/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (start: number, end: number): void => {
    const text = body.slice(start, end);
    if (text.trim().length === 0) return;
    out.push({
      start: bodyOffset + start,
      end: bodyOffset + end,
      tokens: new Set(tokenize(text)),
    });
  };
  while ((match = separator.exec(body)) !== null) {
    push(last, match.index);
    last = match.index + match[0].length;
  }
  push(last, body.length);
  return out;
}

function buildDoc(file: ContextFile): Doc {
  const fm = frontmatterText(file.frontmatter);
  const bodyOffset = file.raw.length - file.body.length;
  const bodyTokens = tokenize(file.body);
  const plainTokens = tokenize(fm.plain);
  const boostedTokens = tokenize(fm.boosted);

  const tf = new Map<string, number>();
  const bump = (t: string, by: number): void => {
    tf.set(t, (tf.get(t) ?? 0) + by);
  };
  for (const t of bodyTokens) bump(t, 1);
  for (const t of plainTokens) bump(t, 1);
  for (const t of boostedTokens) bump(t, 2);

  const length = bodyTokens.length + plainTokens.length + 2 * boostedTokens.length;
  return {
    file,
    tf,
    length,
    paragraphs: splitParagraphs(file.body, bodyOffset),
  };
}

function idf(nDocs: number, docFreq: number): number {
  return Math.log(1 + (nDocs - docFreq + 0.5) / (docFreq + 0.5));
}

/** Rank `scope` against `query`, returning the top `k` hits (default 10). */
export function search(scope: ContextFile[], query: string, k = 10): RetrievalHit[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || scope.length === 0) return [];

  const docs = scope.map(buildDoc);
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;

  const docFreq = new Map<string, number>();
  for (const t of queryTokens) {
    docFreq.set(t, docs.filter((d) => d.tf.has(t)).length);
  }

  interface Scored {
    doc: Doc;
    score: number;
    matched: string[];
  }
  const scored: Scored[] = docs.map((doc) => {
    let score = 0;
    const matched: string[] = [];
    for (const t of queryTokens) {
      const freq = doc.tf.get(t);
      if (!freq) continue;
      matched.push(t);
      const termIdf = idf(docs.length, docFreq.get(t) ?? 0);
      const denom = freq + K1 * (1 - B + (B * doc.length) / (avgLen || 1));
      score += termIdf * ((freq * (K1 + 1)) / (denom || 1));
    }
    return { doc, score, matched };
  });

  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  if (hits.length === 0) return [];
  const maxScore = hits[0]!.score;

  return hits.map(({ doc, score, matched }): RetrievalHit => {
    const matchedSet = new Set(matched);
    let best: Paragraph | undefined = doc.paragraphs[0];
    let bestOverlap = -1;
    for (const p of doc.paragraphs) {
      const overlap = [...matchedSet].filter((t) => p.tokens.has(t)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = p;
      }
    }
    const span: [number, number] = best
      ? [best.start, best.end]
      : [0, Math.min(doc.file.raw.length, 200)];
    return {
      path: doc.file.path,
      span,
      relevance: maxScore > 0 ? score / maxScore : 0,
      why: `matched: ${matched.join(", ")}`,
    };
  });
}
