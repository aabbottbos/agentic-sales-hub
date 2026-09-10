import { describe, expect, it } from "vitest";
import { complete, type CompleteArgs } from "./llm.js";
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";

describe("llm seam", () => {
  it("exports complete() with the documented signature", () => {
    expect(typeof complete).toBe("function");
    // shape check only — real calls are integration-tested behind ANTHROPIC_API_KEY
    const args: CompleteArgs = {
      system: "s",
      user: "u",
      model: "claude-sonnet-5",
      maxTokens: 10,
    };
    expect(args.model).toBe("claude-sonnet-5");
  });
});

const DISCOVERY_NOTE =
  "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md";

describe("validateSummaryOutput", () => {
  const good: SummaryOutput = {
    summary: "We ran discovery with Acme. [unsourced] budget is soft.",
    commitments: [
      {
        text: "Send the Midwest Freight case study",
        owner: "us",
        citation: { path: DISCOVERY_NOTE, span: [10, 40] },
      },
    ],
    next_steps: [],
    context_deltas: [],
    citations: [{ path: DISCOVERY_NOTE, span: [10, 40] }],
    unsourced_claims: ["budget is soft"],
  };

  it("accepts a well-formed summary output", () => {
    expect(validateSummaryOutput(good).valid).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    const bad = { ...good, extra: 1 } as unknown;
    const r = validateSummaryOutput(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/additional/i);
  });

  it("rejects a commitment missing its citation", () => {
    const bad = { ...good, commitments: [{ text: "x", owner: "us" }] } as unknown;
    expect(validateSummaryOutput(bad).valid).toBe(false);
  });

  it("rejects a missing unsourced_claims key", () => {
    const bad: Record<string, unknown> = { ...good };
    delete bad.unsourced_claims;
    expect(validateSummaryOutput(bad).valid).toBe(false);
  });
});

describe("call-summary prompts", () => {
  it("system prompt states the output contract and the citation rule", () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/JSON object/i);
    expect(s).toMatch(/\[unsourced\]/);
    expect(s).toMatch(/offset|span/i);
  });

  it("user prompt embeds the note under a clear delimiter and gives its path", () => {
    const note = "---\nfoo: bar\n---\n\nbody text here";
    const u = buildUserPrompt(
      "context/accounts/acme-logistics/opportunities/OPP/meetings/x.md",
      note,
    );
    expect(u).toContain("context/accounts/acme-logistics/opportunities/OPP/meetings/x.md");
    expect(u).toContain("body text here");
    expect(u).toMatch(/BEGIN MEETING NOTE/);
  });

  it("user prompt does not prepend anything inside the note markers", () => {
    const note = "first char matters for offsets";
    const u = buildUserPrompt("p.md", note);
    const start = u.indexOf("<<<BEGIN MEETING NOTE>>>\n") + "<<<BEGIN MEETING NOTE>>>\n".length;
    const end = u.indexOf("\n<<<END MEETING NOTE>>>");
    expect(u.slice(start, end)).toBe(note);
  });
});
