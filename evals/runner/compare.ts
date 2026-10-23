import type { RunReport } from "./report.js";

// Metrics whose drop below the last committed result is a build-failing
// regression. These are exactly the metrics that also block via a `gates` entry
// — a regression check on an advisory metric would make it non-advisory.
// `call-summary`'s `rubric_aggregate` and `commitment_recall` are advisory
// (spec 002 amendment A1); they are still in every result JSON for by-hand
// history, just not regression-gated.
const PRIMARY: Record<string, string[]> = {
  "sow-review": ["blocker_recall", "precision", "citation_validity"],
  "find-evidence": ["recall", "citation_validity"],
  "call-summary": ["citation_validity"],
  "call-prep": ["citation_validity"],
};

/**
 * Pick the newest `<date>-<sha>.json` result file. Dates sort lexically, but
 * two results can share a date and short shas carry no order, so same-date
 * files are ordered by `addedAt` (when the file was first committed; an
 * uncommitted file should report +Infinity, i.e. newest).
 */
export function latestResultFile(
  files: string[],
  addedAt: (file: string) => number,
): string | undefined {
  const results = files.filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.json$/.test(f)).sort();
  const lastDate = results.at(-1)?.slice(0, 10);
  const sameDay = results.filter((f) => f.slice(0, 10) === lastDate);
  if (sameDay.length <= 1) return sameDay[0];
  return sameDay
    .map((f) => ({ f, t: addedAt(f) }))
    .sort((a, b) => a.t - b.t || a.f.localeCompare(b.f))
    .at(-1)?.f;
}

export interface Comparison {
  verdict: "PASS" | "REGRESSION";
  regressions: string[];
}

/**
 * Compare a fresh report against the last committed one. A regression is any
 * primary metric of any suite dropping below its previous value (with a small
 * epsilon for float noise).
 */
export function compareReports(current: RunReport, previous: RunReport | null): Comparison {
  if (!previous) return { verdict: "PASS", regressions: [] };
  const eps = 1e-6;
  const regressions: string[] = [];

  for (const [suiteName, primary] of Object.entries(PRIMARY)) {
    const cur = current.suites[suiteName]?.aggregate;
    const prev = previous.suites[suiteName]?.aggregate;
    if (!cur || !prev) continue;
    for (const metric of primary) {
      const c = cur[metric];
      const p = prev[metric];
      if (typeof c === "number" && typeof p === "number" && c < p - eps) {
        regressions.push(`${suiteName}.${metric}: ${p} -> ${c}`);
      }
    }
  }

  return { verdict: regressions.length ? "REGRESSION" : "PASS", regressions };
}
