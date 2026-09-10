import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLoader, type ContextLoader } from "@agentic-sales-hub/context-core";
import { complete, type CompleteArgs } from "./llm.js";
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";
import { callSummaryImpl } from "./call-summary.js";
import * as llm from "./llm.js";
import { loadSkill } from "../registry.js";

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
  const cit = {
    path: DISCOVERY_NOTE,
    quote: "Midwest Freight",
    span: [10, 40] as [number, number],
  };
  const good: SummaryOutput = {
    summary: "We ran discovery with Acme. [unsourced] budget is soft.",
    commitments: [{ text: "Send the Midwest Freight case study", owner: "us", citation: cit }],
    next_steps: [],
    context_deltas: [],
    citations: [cit],
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
  it("system prompt states the output contract and the verbatim-quote rule", () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/JSON object/i);
    expect(s).toMatch(/\[unsourced\]/);
    expect(s).toMatch(/quote/i);
    expect(s).toMatch(/exact substring/i);
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

  it("user prompt embeds the note text verbatim between the markers", () => {
    const note = "the exact substring the model must quote from";
    const u = buildUserPrompt("p.md", note);
    const start = u.indexOf("<<<BEGIN MEETING NOTE>>>\n") + "<<<BEGIN MEETING NOTE>>>\n".length;
    const end = u.indexOf("\n<<<END MEETING NOTE>>>");
    expect(u.slice(start, end)).toBe(note);
  });
});

describe("call-summary impl (stubbed model)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "../../../..");
  const OPP = "006Ax0000GkLmNpQAA";
  let loader: ContextLoader;

  beforeAll(async () => {
    loader = await createLoader({
      repoRoot,
      taintLedgerPath: join(repoRoot, ".claude/.taint-ledger.test.jsonl"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes citation spans from the model's verbatim quotes", async () => {
    const raw = (await readFile(join(repoRoot, DISCOVERY_NOTE), "utf8")).replace(/\r\n/g, "\n");
    const quote = "send Midwest Freight case study";
    const stub = JSON.stringify({
      summary: "Discovery call with Acme Logistics about a single exception queue.",
      commitments: [
        {
          text: "Send Midwest Freight case study",
          owner: "us",
          citation: { path: DISCOVERY_NOTE, quote },
        },
      ],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: DISCOVERY_NOTE, quote }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: DISCOVERY_NOTE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    const out = res.output as SummaryOutput;

    expect(res.contextRead).toEqual([DISCOVERY_NOTE]);
    const [s, e] = out.commitments[0].citation.span;
    expect(raw.slice(s, e)).toBe(quote);
    expect(out.citations[0].span[0]).toBeGreaterThanOrEqual(0);
  });

  it("gives an unlocatable quote an out-of-range span (fails the citation gate, no crash)", async () => {
    const raw = (await readFile(join(repoRoot, DISCOVERY_NOTE), "utf8")).replace(/\r\n/g, "\n");
    const stub = JSON.stringify({
      summary: "x",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: DISCOVERY_NOTE, quote: "this phrase is not in the note at all" }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: DISCOVERY_NOTE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    const out = res.output as SummaryOutput;
    expect(out.citations[0].span[0]).toBeGreaterThanOrEqual(raw.length);
  });

  it("passes the whole LF-normalized file as the note text", async () => {
    const raw = (await readFile(join(repoRoot, DISCOVERY_NOTE), "utf8")).replace(/\r\n/g, "\n");
    const stub = JSON.stringify({
      summary: "x",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [],
      unsourced_claims: [],
    });
    const spy = vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-summary");
    await callSummaryImpl.run(
      { meeting_path: DISCOVERY_NOTE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );

    const userPrompt = spy.mock.calls[0][0].user;
    const start =
      userPrompt.indexOf("<<<BEGIN MEETING NOTE>>>\n") + "<<<BEGIN MEETING NOTE>>>\n".length;
    const end = userPrompt.indexOf("\n<<<END MEETING NOTE>>>");
    expect(userPrompt.slice(start, end)).toBe(raw);
  });

  it("throws a clear error when the model never returns valid JSON", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue("here is your summary: ...");
    const def = await loadSkill("call-summary");
    await expect(
      callSummaryImpl.run(
        { meeting_path: DISCOVERY_NOTE },
        { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
        def,
      ),
    ).rejects.toThrow(/no valid output after \d+ attempts/i);
    expect(spy.mock.calls.length).toBeGreaterThan(1); // it retried
  });

  it("recovers when an early model response is unparseable but a later one is valid", async () => {
    const raw = (await readFile(join(repoRoot, DISCOVERY_NOTE), "utf8")).replace(/\r\n/g, "\n");
    const quote = "ONE exception queue";
    const good = JSON.stringify({
      summary: "Acme wants one exception queue.",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: DISCOVERY_NOTE, quote }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete")
      .mockResolvedValueOnce("(thinking out loud, no json here)")
      .mockResolvedValueOnce(good);

    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: DISCOVERY_NOTE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    const out = res.output as SummaryOutput;
    expect(out.summary).toContain("exception queue");
    expect(raw.slice(...out.citations[0].span)).toBe(quote);
  });

  it("retries then throws when the model output never satisfies the schema", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue('{"summary": "x"}');
    const def = await loadSkill("call-summary");
    await expect(
      callSummaryImpl.run(
        { meeting_path: DISCOVERY_NOTE },
        { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
        def,
      ),
    ).rejects.toThrow(/no valid output after \d+ attempts \(last: schema/i);
    expect(spy.mock.calls.length).toBeGreaterThan(1);
  });

  it("recovers when an early response fails the schema but a later one passes", async () => {
    const quote = "ONE exception queue";
    const good = JSON.stringify({
      summary: "Acme wants one exception queue.",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: DISCOVERY_NOTE, quote }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete")
      .mockResolvedValueOnce(
        '{"summary":"x","context_deltas":[{"field":"risk","observation":"y","citation":{"path":"p","quote":"q"},"extra":1}]}',
      )
      .mockResolvedValueOnce(good);
    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: DISCOVERY_NOTE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    expect((res.output as SummaryOutput).summary).toContain("exception queue");
  });

  it("rejects a meeting_path outside the resolved scope", async () => {
    vi.spyOn(llm, "complete").mockResolvedValue("{}");
    const def = await loadSkill("call-summary");
    await expect(
      callSummaryImpl.run(
        { meeting_path: "context/org/company.md" },
        { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
        def,
      ),
    ).rejects.toThrow();
  });
});
