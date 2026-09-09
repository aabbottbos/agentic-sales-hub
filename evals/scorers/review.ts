import type { Finding, Severity } from "@agentic-sales-hub/context-core";

export const SEVERITY_WEIGHT: Record<Severity, number> = { blocker: 5, major: 2, minor: 1 };

export interface ReviewScore {
  blockerRecall: number;
  severityWeightedRecall: number;
  precision: number;
  matchedBlockers: number;
  totalBlockers: number;
  matched: number;
  produced: number;
  labeled: number;
}

/**
 * A produced finding matches a label if they cite the same clause file, name the
 * same locator clause, and their locator spans overlap by at least one character.
 */
export function matches(produced: Finding, label: Finding): boolean {
  const sameClauseFile = clauseBase(produced.citation.path) === clauseBase(label.citation.path);
  const sameLocator = produced.locator.clause === label.locator.clause;
  const [ps, pe] = produced.locator.span;
  const [ls, le] = label.locator.span;
  const overlap = Math.min(pe, le) - Math.max(ps, ls) > 0;
  return sameClauseFile && sameLocator && overlap;
}

function clauseBase(path: string): string {
  return path.split("/").pop() ?? path;
}

export function scoreReview(produced: Finding[], labeled: Finding[]): ReviewScore {
  const labeledBlockers = labeled.filter((f) => f.severity === "blocker");
  const matchedLabels = labeled.filter((label) => produced.some((p) => matches(p, label)));
  const matchedBlockers = labeledBlockers.filter((label) =>
    produced.some((p) => matches(p, label)),
  ).length;

  const weightedTotal = labeled.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
  const weightedMatched = matchedLabels.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);

  const matchedProduced = produced.filter((p) => labeled.some((label) => matches(p, label))).length;

  return {
    blockerRecall: labeledBlockers.length === 0 ? 1 : matchedBlockers / labeledBlockers.length,
    severityWeightedRecall: weightedTotal === 0 ? 1 : weightedMatched / weightedTotal,
    precision: produced.length === 0 ? 1 : matchedProduced / produced.length,
    matchedBlockers,
    totalBlockers: labeledBlockers.length,
    matched: matchedLabels.length,
    produced: produced.length,
    labeled: labeled.length,
  };
}
