import { describe, expect, it, vi, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as llm from "../../packages/skills/src/impl/llm.js";
import { scoreRubric, aggregate } from "./judge.js";
import type { SummaryOutput } from "../../packages/skills/src/impl/summary-schema.js";

const here = dirname(fileURLToPath(import.meta.url));

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

  it("returns unavailable (not a throw) when the judge never parses", async () => {
    vi.spyOn(llm, "complete").mockResolvedValue("nope");
    const r = await scoreRubric(OUT, "n", { attempts: 3 });
    expect(r.unavailable).toBe(true);
    expect(r.aggregate).toBe(0);
    expect(r.attempts).toHaveLength(0);
  });

  it("returns unavailable when every judge call throws", async () => {
    vi.spyOn(llm, "complete").mockRejectedValue(new Error("500"));
    const r = await scoreRubric(OUT, "n", { attempts: 3 });
    expect(r.unavailable).toBe(true);
  });

  it("ignores an unparseable attempt but uses the good ones", async () => {
    // attempts: 2 — the loop stops once it has 2 good scores. With `attempts: 3`
    // it would keep calling past these three canned responses (by design: see
    // judge.ts's `maxCalls = attempts + 2`), which the mock chain isn't sized for.
    vi.spyOn(llm, "complete")
      .mockResolvedValueOnce("garbage")
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}')
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}');
    const r = await scoreRubric(OUT, "n", { attempts: 2 });
    expect(r.aggregate).toBe(4);
    expect(r.attempts).toHaveLength(2);
  });

  it("accepts an explicit rubric/prompt file pair and still retry-medians correctly", async () => {
    const spy = vi
      .spyOn(llm, "complete")
      .mockResolvedValueOnce('{"grounding":3,"completeness":3,"tone":3,"structure":3}')
      .mockResolvedValueOnce('{"grounding":5,"completeness":5,"tone":5,"structure":5}')
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}');
    const r = await scoreRubric(OUT, "note text", {
      attempts: 3,
      rubricFile: join(here, "call-prep-rubric.md"),
      promptFile: join(here, "call-prep-judge-prompt.md"),
    });
    // medians of [3,4,5] per dim -> 4; aggregate -> 4
    expect(r.grounding).toBe(4);
    expect(r.aggregate).toBe(4);
    expect(r.attempts).toHaveLength(3);
    // Proves the explicit files were actually loaded, not the call-summary
    // defaults: the call-prep rubric/prompt content must be in the sent prompt,
    // and the call-summary-only prose must not be.
    const sentPrompt = spy.mock.calls[0]?.[0]?.user ?? "";
    expect(sentPrompt).toContain("call-prep rubric");
    expect(sentPrompt).toContain("BRIEF OUTPUT");
    expect(sentPrompt).not.toContain("call-summary rubric");
  });
});
