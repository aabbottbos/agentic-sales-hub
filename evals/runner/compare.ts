import type { RunReport } from "./report.js";

const PRIMARY: Record<string, string[]> = {
  "sow-review": ["blocker_recall", "precision", "citation_validity"],
  "find-evidence": ["recall", "citation_validity"],
};

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
