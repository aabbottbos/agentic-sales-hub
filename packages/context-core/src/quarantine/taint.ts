import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sha256 } from "./hash.js";
import type { TaintMatch } from "../types.js";

/**
 * Taint ledger: session state written by the loader every time `inbound/**`
 * content is ingested. The quarantine hook reads it to block any tool call whose
 * arguments contain text derived from a quarantined document.
 *
 * One JSON line per ingest: `{ ts, source, sha256, shingles }`, where `shingles`
 * are overlapping normalized 8-word n-grams of the body. Shingles let the hook
 * catch a *fragment* of an inbound doc, not just the whole thing.
 *
 * The ledger is gitignored and stale-tolerant: matching an old inbound doc is
 * still a valid block.
 *
 * Two match profiles (plan 006):
 *   - `strict` (the default — fail closed): everything `standard` checks, plus
 *     a short distinctive run (`STRICT_RUN_WORDS` words) lifted from a body
 *     anywhere inside a longer value. The quarantine hook uses this.
 *   - `standard`: long overlaps and whole-value short phrases only. Used by
 *     the MCP/watcher persist path, whose summaries legitimately echo short
 *     phrases from their own inbound source.
 *
 * Shorter n-grams are derived at match time from the stored 8-word shingles
 * (every k-word window of a body, k <= 8, sits inside some 8-word shingle), so
 * the ledger format is unchanged.
 */

const SHINGLE_WORDS = 8;
/** Minimum distinct shingles shared before a value is considered tainted. */
export const DEFAULT_SHINGLE_THRESHOLD = 2;
/** Strict profile: length in words of an embedded lifted run (rule 4). */
export const STRICT_RUN_WORDS = 6;
/** Strict profile: minimum non-stopword words in an embedded lifted run (rule 4). */
export const STRICT_RUN_MIN_CONTENT_WORDS = 3;
/**
 * Minimum non-stopword words for a whole short-phrase value to count as a lift
 * (rule 3). At 2, clause headings like "limitation of liability" (shared by
 * every redline and our own clause library) block a plain Grep for them.
 */
export const SHORT_PHRASE_MIN_CONTENT_WORDS = 3;

export type TaintProfile = "strict" | "standard";

export interface TaintMatchOptions {
  /** Defaults to `strict`. */
  profile?: TaintProfile;
  /** Rule 1 shared-shingle threshold. Defaults to `DEFAULT_SHINGLE_THRESHOLD`. */
  threshold?: number;
  /** Rule 4 run length. Defaults to `STRICT_RUN_WORDS`; exposed for calibration. */
  runWords?: number;
  /** Rule 4 content-word minimum. Defaults to `STRICT_RUN_MIN_CONTENT_WORDS`; exposed for calibration. */
  runMinContentWords?: number;
}

/** Function words that make a lifted phrase generic rather than distinctive. */
const STOPWORDS = new Set(
  (
    "a an the and or but nor if then else so of to in on at by for from with without into onto " +
    "over under about as via per up down out off is are was were be been being am do does did " +
    "done have has had having shall will would should can could may might must not no yes this " +
    "that these those it its they them their there here we us our you your i me my he she his " +
    "her him who whom which what when where why how all any each some such than too very just " +
    "also only own same other more most both either neither s t"
  ).split(" "),
);

function contentWordCount(ws: string[]): number {
  return ws.filter((w) => !STOPWORDS.has(w)).length;
}

/** Word-boundary containment of one normalized phrase in another. */
function containsRun(hay: string, needle: string): boolean {
  return ` ${hay} `.includes(` ${needle} `);
}

/** Distinct k-word windows of a ledger entry's body, derived from its shingles. */
function bodyNgrams(entry: TaintLedgerEntry, k: number): Set<string> {
  const out = new Set<string>();
  for (const s of entry.shingles) {
    const ws = s.split(" ");
    for (let i = 0; i + k <= ws.length; i++) out.add(ws.slice(i, i + k).join(" "));
  }
  return out;
}

export interface TaintLedgerEntry {
  ts: string;
  source: string;
  sha256: string;
  shingles: string[];
}

/** Lowercase, collapse whitespace, strip punctuation. Used for both shingles and match candidates. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Overlapping n-word shingles of normalized text. */
export function shingles(text: string, n = SHINGLE_WORDS): string[] {
  const words = normalizeForMatch(text).split(" ").filter(Boolean);
  if (words.length < n) {
    return words.length > 0 ? [words.join(" ")] : [];
  }
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) {
    out.push(words.slice(i, i + n).join(" "));
  }
  return [...new Set(out)];
}

export interface TaintLedger {
  /** Record an inbound ingest. */
  register(sourcePath: string, body: string): Promise<void>;
  /** Load all entries (empty if the ledger file does not exist). */
  entries(): Promise<TaintLedgerEntry[]>;
  /**
   * Check whether `value` contains text derived from any ingested inbound doc.
   * See the rules in `match()` below; `opts.profile` defaults to `strict`.
   */
  match(value: string, opts?: TaintMatchOptions): Promise<TaintMatch | null>;
}

export function createTaintLedger(ledgerPath: string): TaintLedger {
  return {
    async register(sourcePath, body) {
      const entry: TaintLedgerEntry = {
        ts: new Date().toISOString(),
        source: sourcePath.replaceAll("\\", "/"),
        sha256: sha256(body),
        shingles: shingles(body),
      };
      await mkdir(dirname(ledgerPath), { recursive: true });
      await appendFile(ledgerPath, JSON.stringify(entry) + "\n", "utf8");
    },

    async entries() {
      let text: string;
      try {
        text = await readFile(ledgerPath, "utf8");
      } catch {
        return [];
      }
      const out: TaintLedgerEntry[] = [];
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          out.push(JSON.parse(trimmed) as TaintLedgerEntry);
        } catch {
          // skip a corrupt line rather than failing the whole check
        }
      }
      return out;
    },

    async match(value, opts = {}) {
      const {
        profile = "strict",
        threshold = DEFAULT_SHINGLE_THRESHOLD,
        runWords = STRICT_RUN_WORDS,
        runMinContentWords = STRICT_RUN_MIN_CONTENT_WORDS,
      } = opts;
      const all = await this.entries();
      if (all.length === 0) return null;
      const normValue = normalizeForMatch(value);
      if (!normValue) return null;
      const valueShingleSet = new Set(shingles(value));
      const valueWords = normValue.split(" ").filter(Boolean);
      /** A short lifted phrase: a whole 3-7 word value with enough content words to be distinctive. */
      const shortPhrase =
        valueWords.length >= 3 &&
        valueWords.length < SHINGLE_WORDS &&
        contentWordCount(valueWords) >= SHORT_PHRASE_MIN_CONTENT_WORDS
          ? normValue
          : null;
      /** Strict only: distinctive `runWords`-word windows of the value. */
      const valueRuns: string[] = [];
      if (profile === "strict") {
        for (let i = 0; i + runWords <= valueWords.length; i++) {
          const run = valueWords.slice(i, i + runWords);
          if (contentWordCount(run) >= runMinContentWords) valueRuns.push(run.join(" "));
        }
      }

      for (const entry of all) {
        const hit = (matchedText: string): TaintMatch => ({
          sourcePath: entry.source,
          hash: entry.sha256,
          matchedText,
        });
        // 1. Long-overlap: value and body share >= threshold distinct 8-word shingles.
        const shared = entry.shingles.filter((s) => valueShingleSet.has(s));
        if (shared.length >= threshold) return hit(shared[0] ?? "");
        // 2. A whole body shingle appears as a word run in a longer value.
        const shingleHit = entry.shingles.find((s) => containsRun(normValue, s));
        if (shingleHit) return hit(shingleHit);
        // 3. A whole short distinctive value appears as a word run inside a body shingle.
        if (shortPhrase && entry.shingles.some((s) => containsRun(s, shortPhrase))) {
          return hit(shortPhrase);
        }
        // 4. Strict: a distinctive short run lifted from the body, anywhere in the value.
        if (valueRuns.length) {
          const grams = bodyNgrams(entry, runWords);
          const runHit = valueRuns.find((r) => grams.has(r));
          if (runHit) return hit(runHit);
        }
      }
      return null;
    },
  };
}
