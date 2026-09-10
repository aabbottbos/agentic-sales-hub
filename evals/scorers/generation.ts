/**
 * Deterministic scorers for the `generation` eval class (spec 002).
 *
 * `scoreCommitmentRecall` is the "did the summary miss a real commitment"
 * gate (>= 0.90). It is intentionally lenient about wording and strict about
 * coverage: a labeled commitment is "covered" if some produced commitment or
 * next_step shares at least half of the label's content tokens. Same
 * normalized-token-overlap idea as `covers` / `matches` in the sibling scorers.
 *
 * The token threshold (0.5) and stopword filter (`len > 2`) are the knobs; a
 * calibration change belongs in this comment with a note on why.
 */

export interface LabeledCommitment {
  text: string;
}

export interface ProducedItems {
  commitments: { text: string }[];
  next_steps: { text: string }[];
}

export interface CommitmentRecallScore {
  /** covered labels / total labels; 1 when there are no labels */
  recall: number;
  covered: number;
  total: number;
  /** the labels no produced item covered */
  misses: string[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(" ")
      .filter((t) => t.length > 2),
  );
}

/** A label is covered if a produced item shares >= 0.5 of the label's tokens. */
function isCovered(label: string, produced: { text: string }[]): boolean {
  const lt = tokens(label);
  if (lt.size === 0) return produced.length > 0;
  for (const p of produced) {
    const pt = tokens(p.text);
    let hit = 0;
    for (const t of lt) if (pt.has(t)) hit++;
    if (hit / lt.size >= 0.5) return true;
  }
  return false;
}

export function scoreCommitmentRecall(
  produced: ProducedItems,
  labeled: LabeledCommitment[],
): CommitmentRecallScore {
  const pool = [...produced.commitments, ...produced.next_steps];
  const misses: string[] = [];
  let covered = 0;
  for (const l of labeled) {
    if (isCovered(l.text, pool)) covered++;
    else misses.push(l.text);
  }
  return {
    recall: labeled.length === 0 ? 1 : covered / labeled.length,
    covered,
    total: labeled.length,
    misses,
  };
}
