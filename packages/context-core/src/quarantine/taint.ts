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
 */

const SHINGLE_WORDS = 8;
/** Minimum distinct shingles shared before a value is considered tainted. */
export const DEFAULT_SHINGLE_THRESHOLD = 2;

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
   * Matches if the value contains the full body hash's source text (exact-substring
   * of the whole body) OR shares >= `threshold` distinct shingles with an entry.
   */
  match(value: string, threshold?: number): Promise<TaintMatch | null>;
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

    async match(value, threshold = DEFAULT_SHINGLE_THRESHOLD) {
      const all = await this.entries();
      if (all.length === 0) return null;
      const normValue = normalizeForMatch(value);
      if (!normValue) return null;
      const valueShingleSet = new Set(shingles(value));
      const valueWords = normValue.split(" ").filter(Boolean);
      /** A short lifted phrase: 3+ consecutive words that appear inside some body shingle. */
      const shortPhrase =
        valueWords.length >= 3 && valueWords.length < SHINGLE_WORDS ? normValue : null;

      for (const entry of all) {
        // 1. Long-overlap: value and body share >= threshold distinct 8-word shingles.
        const shared = entry.shingles.filter((s) => valueShingleSet.has(s));
        if (shared.length >= threshold) {
          return { sourcePath: entry.source, hash: entry.sha256, matchedText: shared[0] ?? "" };
        }
        // 2. Whole body shingle appears verbatim in a longer value.
        const substringHit = entry.shingles.find((s) => normValue.includes(s));
        if (substringHit) {
          return { sourcePath: entry.source, hash: entry.sha256, matchedText: substringHit };
        }
        // 3. Short lifted phrase (3-7 words) appears verbatim inside a body shingle.
        if (shortPhrase) {
          const phraseHit = entry.shingles.find((s) => s.includes(shortPhrase));
          if (phraseHit) {
            return { sourcePath: entry.source, hash: entry.sha256, matchedText: shortPhrase };
          }
        }
      }
      return null;
    },
  };
}
