import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createLoader,
  resolveContextPath,
  type ContextLoader,
} from "@agentic-sales-hub/context-core";
import { complete, type CompleteArgs } from "./llm.js";
import { misquoteFeedback } from "./citation-span.js";
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
      model: "claude-sonnet-5-5",
      maxTokens: 10,
    };
    expect(args.model).toBe("claude-sonnet-5-5");
  });

  describe("request shape per model (plan 008)", () => {
    const text = (t: string) => [{ type: "text", text: t }];
    function stubClient(response: Record<string, unknown>) {
      const calls: { path: "messages" | "beta"; params: Record<string, unknown> }[] = [];
      const create = (path: "messages" | "beta") => (params: Record<string, unknown>) => {
        calls.push({ path, params });
        return Promise.resolve({ model: params.model, stop_reason: "end_turn", ...response });
      };
      llm._setClientForTest({
        messages: { create: create("messages") },
        beta: { messages: { create: create("beta") } },
      });
      return calls;
    }
    const args = (model: string): CompleteArgs => ({
      system: "s",
      user: "u",
      model,
      maxTokens: 10,
    });

    afterEach(() => {
      llm._setClientForTest(null);
      vi.restoreAllMocks();
    });

    it("claude-sonnet-5-5: beta path, between_tools at effort high, server-side fallback", async () => {
      const calls = stubClient({ content: text("ok") });
      expect(await complete(args("claude-sonnet-5-5"))).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.path).toBe("beta");
      expect(calls[0]!.params).toMatchObject({
        model: "claude-sonnet-5-5",
        thinking: { type: "between_tools" },
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    });

    it("claude-sonnet-5 (the judge): standard path, thinking disabled, no fallback", async () => {
      const calls = stubClient({ content: text("ok") });
      await complete(args("claude-sonnet-5"));
      expect(calls[0]!.path).toBe("messages");
      expect(calls[0]!.params.thinking).toEqual({ type: "disabled" });
      expect(calls[0]!.params).not.toHaveProperty("fallbacks");
      expect(calls[0]!.params).not.toHaveProperty("output_config");
    });

    it("throws (without retrying) on a refusal, naming the category", async () => {
      const calls = stubClient({
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "general_harms" },
      });
      await expect(complete(args("claude-sonnet-5-5"))).rejects.toThrow(
        /refusal category: general_harms/,
      );
      expect(calls).toHaveLength(1);
    });

    it("returns a fallback-served answer and warns which model served it", async () => {
      stubClient({ content: text("ok"), model: "claude-sonnet-5" });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await complete(args("claude-sonnet-5-5"))).toBe("ok");
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/served by claude-sonnet-5\b/));
    });
  });
});

const DISCOVERY_NOTE =
  "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md";
const MSA_REDLINE =
  "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/inbound/2026-09-02-acme-msa-redline.md";

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
  const contextRoot = join(repoRoot, "examples/demo-corpus");
  const OPP = "006Ax0000GkLmNpQAA";
  let loader: ContextLoader;

  beforeAll(async () => {
    loader = await createLoader({
      repoRoot,
      root: contextRoot,
      taintLedgerPath: join(repoRoot, ".claude/.taint-ledger.test.jsonl"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes citation spans from the model's verbatim quotes", async () => {
    const raw = (await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
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
    const raw = (await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
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
    const raw = (await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
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
    const raw = (await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
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

describe("call-summary impl — inbound-read amendment (spec 005 Task 5)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "../../../..");
  const contextRoot = join(repoRoot, "examples/demo-corpus");
  const OPP = "006Ax0000GkLmNpQAA";
  let loader: ContextLoader;

  beforeAll(async () => {
    loader = await createLoader({
      repoRoot,
      root: contextRoot,
      taintLedgerPath: join(repoRoot, ".claude/.taint-ledger.test.jsonl"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("regression: a meetings/** path still reads via ctx.loader.read() and is never tainted", async () => {
    const raw = (await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
    const quote = "ONE exception queue";
    const stub = JSON.stringify({
      summary: "Acme wants one exception queue.",
      commitments: [],
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
    expect(raw.slice(...out.citations[0].span)).toBe(quote);

    // The meeting note's content must not register as tainted — only readInbound()
    // registers taint, and this path never calls it.
    const tainted = await loader.isTainted(raw);
    expect(tainted).toBeNull();
  });

  it("an inbound/** path reads via readInbound()+extractUntrusted() and registers taint", async () => {
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
    const res = await callSummaryImpl.run(
      { meeting_path: MSA_REDLINE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    const out = res.output as SummaryOutput;

    expect(validateSummaryOutput(out).valid).toBe(true);
    expect(res.contextRead).toEqual([MSA_REDLINE]);

    // The prompt sent to the model must be the plain (unwrapped) body — never the
    // raw <untrusted-content> wrapper, and never containing the [SYSTEM NOTE:...]
    // preamble that would confuse a summarization prompt.
    const userPrompt = spy.mock.calls[0][0].user;
    expect(userPrompt).not.toContain("<untrusted-content");
    expect(userPrompt).not.toContain("[SYSTEM NOTE:");

    // Pull a genuine multi-word phrase out of the note text actually embedded in
    // the prompt (real content from the redline, not a guessed string) to use as
    // the taint-match probe.
    const start =
      userPrompt.indexOf("<<<BEGIN MEETING NOTE>>>\n") + "<<<BEGIN MEETING NOTE>>>\n".length;
    const end = userPrompt.indexOf("\n<<<END MEETING NOTE>>>");
    const noteBody = userPrompt.slice(start, end);
    const words = noteBody.split(/\s+/).filter(Boolean);
    const probe = words.slice(0, 8).join(" ");
    expect(probe.split(" ").length).toBeGreaterThanOrEqual(3);

    // readInbound()'s taint registration must have actually fired: a value drawn
    // from the ingested document now matches the taint ledger.
    const after = await loader.isTainted(probe);
    expect(after).not.toBeNull();
    expect(after?.sourcePath).toBe(MSA_REDLINE);
  });

  it("resolves an inbound citation span correctly against the raw file (frontmatter included)", async () => {
    const rawFile = (await readFile(resolveContextPath(MSA_REDLINE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
    const bodyOnly = (await loader.readInbound(MSA_REDLINE)).wrapped;
    const noteBody = loader.extractUntrusted(bodyOnly);
    const quote = noteBody.trim().slice(0, 40).trim();

    const stub = JSON.stringify({
      summary: "x",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: MSA_REDLINE, quote }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: MSA_REDLINE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    const out = res.output as SummaryOutput;

    // The span must slice correctly against the RAW file (frontmatter included) —
    // resolveCitation() always re-reads and slices raw, never the
    // frontmatter-stripped body extractUntrusted() returns. If the impl failed to
    // offset the span, this would read the wrong (or out-of-range) text instead
    // of the model's verbatim quote.
    const [s, e] = out.citations[0].span;
    expect(rawFile.slice(s, e)).toBe(quote);

    const resolved = await loader.resolveCitation(out.citations[0]);
    expect(resolved.text).toBe(quote);
  });

  it("gives an inbound citation quote not found verbatim an out-of-range span relative to the raw file", async () => {
    const rawFile = (await readFile(resolveContextPath(MSA_REDLINE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
    const stub = JSON.stringify({
      summary: "x",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: MSA_REDLINE, quote: "this phrase is not in the redline at all" }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: MSA_REDLINE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    const out = res.output as SummaryOutput;
    expect(out.citations[0].span[0]).toBeGreaterThanOrEqual(rawFile.length);
  });
});

describe("call-summary regenerate-once on misquote (plan 009)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "../../../..");
  const contextRoot = join(repoRoot, "examples/demo-corpus");
  const OPP = "006Ax0000GkLmNpQAA";
  const GOOD = "ONE exception queue";
  const STITCHED = "one exception queue across all carrier portals by Friday";
  let loader: ContextLoader;

  beforeAll(async () => {
    loader = await createLoader({
      repoRoot,
      root: contextRoot,
      taintLedgerPath: join(repoRoot, ".claude/.taint-ledger.test.jsonl"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const summary = (quote: string) =>
    JSON.stringify({
      summary: "Acme wants one exception queue.",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: DISCOVERY_NOTE, quote }],
      unsourced_claims: [],
    });

  async function run() {
    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: DISCOVERY_NOTE },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );
    return res.output as SummaryOutput;
  }

  it("regenerates once with feedback and uses the clean second answer", async () => {
    const raw = (await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")).replace(
      /\r\n/g,
      "\n",
    );
    expect(raw).not.toContain(STITCHED);
    const spy = vi
      .spyOn(llm, "complete")
      .mockResolvedValueOnce(summary(STITCHED))
      .mockResolvedValueOnce(summary(GOOD));
    const out = await run();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![0].user).toContain(JSON.stringify(STITCHED));
    expect(raw.slice(...out.citations[0]!.span)).toBe(GOOD);
  });

  it("regenerates at most once, then returns the misquoted answer for the gate to fail", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue(summary(STITCHED));
    await run();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("misquoteFeedback", () => {
  it("lists each failed path + quote, truncates long quotes, and caps the list", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ path: `p${i}.md`, quote: `q${i}` }));
    const long = { path: "long.md", quote: "x".repeat(300) };
    const text = misquoteFeedback([long, ...many]);
    expect(text).toContain('long.md: "' + "x".repeat(200) + '…"');
    expect(text).toContain('p8.md: "q8"');
    expect(text).not.toContain("p9.md");
    expect(text).toContain("…and 3 more");
    expect(text).toMatch(/unsourced_claims/);
    expect(misquoteFeedback([long, ...many])).toBe(text);
  });
});
