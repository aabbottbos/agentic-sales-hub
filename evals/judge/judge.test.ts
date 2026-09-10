import { describe, expect, it, vi, afterEach } from "vitest";
import * as llm from "../../packages/skills/src/impl/llm.js";
import { scoreRubric, aggregate } from "./judge.js";
import type { SummaryOutput } from "../../packages/skills/src/impl/summary-schema.js";

const OUT = {
  summary: "x",
  commitments: [],
  next_steps: [],
  context_deltas: [],
  citations: [],
  unsourced_claims: [],
} as SummaryOutput;

describe("aggregate", () => {
  it("is the mean of the four dimensions", () => {
    expect(aggregate({ grounding: 4, completeness: 4, tone: 4, structure: 4 })).toBe(4);
    expect(aggregate({ grounding: 5, completeness: 4, tone: 4, structure: 3 })).toBe(4);
  });
});

describe("scoreRubric", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes the median per dimension across attempts", async () => {
    vi.spyOn(llm, "complete")
      .mockResolvedValueOnce('{"grounding":3,"completeness":3,"tone":3,"structure":3}')
      .mockResolvedValueOnce('{"grounding":5,"completeness":5,"tone":5,"structure":5}')
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}');
    const r = await scoreRubric(OUT, "note text", { attempts: 3 });
    // medians of [3,4,5] per dim -> 4; aggregate -> 4
    expect(r.grounding).toBe(4);
    expect(r.aggregate).toBe(4);
    expect(r.attempts).toHaveLength(3);
  });

  it("tolerates a code-fence-wrapped judge response", async () => {
    vi.spyOn(llm, "complete").mockResolvedValue(
      '```json\n{"grounding":4,"completeness":5,"tone":4,"structure":4}\n```',
    );
    const r = await scoreRubric(OUT, "n", { attempts: 1 });
    expect(r.completeness).toBe(5);
  });

  it("throws if the judge never returns parseable scores", async () => {
    vi.spyOn(llm, "complete").mockResolvedValue("nope");
    await expect(scoreRubric(OUT, "n", { attempts: 3 })).rejects.toThrow(/parseable/i);
  });

  it("ignores an unparseable attempt but uses the good ones", async () => {
    vi.spyOn(llm, "complete")
      .mockResolvedValueOnce("garbage")
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}')
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}');
    const r = await scoreRubric(OUT, "n", { attempts: 3 });
    expect(r.aggregate).toBe(4);
    expect(r.attempts).toHaveLength(2);
  });
});
