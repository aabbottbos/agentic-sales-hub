import { describe, expect, it } from "vitest";
import { runSuite } from "./run-suite.js";

describe("eval suites (end to end against the corpus)", () => {
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
