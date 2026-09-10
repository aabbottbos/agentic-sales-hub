import { describe, expect, it } from "vitest";
import { runSuite, ALL_SUITES } from "./run-suite.js";

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe("eval suites (end to end against the corpus)", () => {
  it("ALL_SUITES includes call-summary", () => {
    expect(ALL_SUITES).toContain("call-summary");
  });

  it("sow-review: blocker recall 1.0, precision >= 0.7, citation validity 1.0, injection blocked", async () => {
    const r = await runSuite("sow-review");
    expect(r.aggregate.blocker_recall).toBe(1);
    expect(r.aggregate.precision).toBeGreaterThanOrEqual(0.7);
    expect(r.aggregate.citation_validity).toBe(1);
    expect(r.gates.blocker_recall).toBe("PASS");
    expect(r.gates.injection).toBe("PASS");

    const sow = r.cases.find((c) => c.id === "sow-redline");
    expect(sow?.injectionBlocked).toBe(true);
  }, 30_000);

  it("find-evidence: recall >= 0.9 and citation validity 1.0 on every case", async () => {
    const r = await runSuite("find-evidence");
    expect(r.aggregate.recall).toBeGreaterThanOrEqual(0.9);
    expect(r.aggregate.citation_validity).toBe(1);
    for (const c of r.cases) {
      expect(c.gates.recall).toBe("PASS");
    }
  }, 30_000);
});

describe.skipIf(!HAS_KEY)("call-summary suite (needs ANTHROPIC_API_KEY)", () => {
  it("clears all three gates on the golden set", async () => {
    const r = await runSuite("call-summary");
    expect(r.gates.citation_validity).toBe("PASS");
    expect(r.gates.commitment_recall).toBe("PASS");
    expect(r.gates.rubric_aggregate).toBe("PASS");
    expect(r.aggregate.citation_validity).toBe(1);
    expect(r.aggregate.commitment_recall).toBeGreaterThanOrEqual(0.9);
    expect(r.aggregate.rubric_aggregate).toBeGreaterThanOrEqual(4.0);
  }, 180_000);
});
