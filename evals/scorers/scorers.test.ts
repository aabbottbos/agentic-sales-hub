import { describe, expect, it } from "vitest";
import { scoreRetrieval, covers } from "./retrieval.js";
import { scoreReview, matches } from "./review.js";
import type { Finding, RetrievalHit } from "@agentic-sales-hub/context-core";

const hit = (path: string, span: [number, number]): RetrievalHit => ({
  path,
  span,
  relevance: 1,
  why: "x",
});

describe("retrieval scorer", () => {
  it("covers requires same path and >= 50% span overlap", () => {
    expect(covers(hit("a.md", [10, 30]), { path: "a.md", span: [0, 40], required: true })).toBe(
      true,
    );
    expect(covers(hit("a.md", [10, 12]), { path: "a.md", span: [0, 40], required: true })).toBe(
      false,
    );
    expect(covers(hit("b.md", [0, 40]), { path: "a.md", span: [0, 40], required: true })).toBe(
      false,
    );
  });

  it("recall is covered-required / total-required", () => {
    const hits = [hit("a.md", [0, 100]), hit("b.md", [0, 100])];
    const labels = [
      { path: "a.md", span: [10, 20] as [number, number], required: true },
      { path: "b.md", span: [10, 20] as [number, number], required: true },
      { path: "c.md", span: [10, 20] as [number, number], required: true },
    ];
    const s = scoreRetrieval(hits, labels, 5);
    expect(s.recall).toBeCloseTo(2 / 3);
    expect(s.coveredRequired).toBe(2);
    expect(s.totalRequired).toBe(3);
  });

  it("recall is 1 when there are no required labels", () => {
    expect(scoreRetrieval([], [], 5).recall).toBe(1);
  });
});

const finding = (over: Partial<Finding>): Finding => ({
  finding_id: "f-001",
  document: "d.md",
  locator: { clause: "9.3", span: [100, 200] },
  issue: "x",
  severity: "blocker",
  position: "unacceptable",
  citation: { path: "context/legal/clause-library/indemnity.md", span: [0, 10] },
  suggested_redline: "x",
  confidence: 0.9,
  ...over,
});

describe("review scorer", () => {
  it("matches requires same clause file, same locator clause, overlapping locator spans", () => {
    const produced = finding({ locator: { clause: "9.3", span: [120, 140] } });
    const label = finding({ finding_id: "L-1", locator: { clause: "9.3", span: [100, 200] } });
    expect(matches(produced, label)).toBe(true);

    const wrongClause = finding({ locator: { clause: "10.1", span: [120, 140] } });
    expect(matches(wrongClause, label)).toBe(false);

    const noOverlap = finding({ locator: { clause: "9.3", span: [300, 320] } });
    expect(matches(noOverlap, label)).toBe(false);
  });

  it("blockerRecall = matched blocker labels / total blocker labels", () => {
    const labels = [
      finding({ finding_id: "L-1", locator: { clause: "9.3", span: [100, 200] } }),
      finding({
        finding_id: "L-2",
        locator: { clause: "10.1", span: [100, 200] },
        citation: {
          path: "context/legal/clause-library/limitation-of-liability.md",
          span: [0, 1],
        },
      }),
    ];
    const produced = [finding({ locator: { clause: "9.3", span: [110, 130] } })];
    const s = scoreReview(produced, labels);
    expect(s.blockerRecall).toBe(0.5);
    expect(s.totalBlockers).toBe(2);
    expect(s.matchedBlockers).toBe(1);
  });

  it("precision = matched produced / total produced; a false positive lowers it", () => {
    const labels = [finding({ finding_id: "L-1", locator: { clause: "9.3", span: [100, 200] } })];
    const produced = [
      finding({ locator: { clause: "9.3", span: [110, 130] } }),
      finding({
        finding_id: "f-002",
        severity: "minor",
        locator: { clause: "99.9", span: [1, 2] },
        citation: { path: "context/legal/clause-library/payment-terms.md", span: [0, 1] },
        suggested_redline: undefined,
      }),
    ];
    const s = scoreReview(produced, labels);
    expect(s.precision).toBe(0.5);
    expect(s.blockerRecall).toBe(1);
  });

  it("blockerRecall is 1 when there are no blocker labels", () => {
    expect(scoreReview([], []).blockerRecall).toBe(1);
  });
});
