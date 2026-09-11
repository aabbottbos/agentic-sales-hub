import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createLoader,
  resolveContextPath,
  type ContextLoader,
} from "@agentic-sales-hub/context-core";
import { validateBriefOutput, type BriefOutput } from "./brief-schema.js";
import { callPrepImpl } from "./call-prep.js";
import * as llm from "./llm.js";
import { loadSkill } from "../registry.js";

const DISCOVERY_NOTE =
  "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md";
const OPPORTUNITY_RECORD =
  "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/opportunity.md";

describe("validateBriefOutput", () => {
  const cit = {
    path: DISCOVERY_NOTE,
    quote: "Midwest Freight",
    span: [10, 40] as [number, number],
  };
  const good: BriefOutput = {
    goal: "Get IT comfortable with the integration and put a concrete SOW in Dana's hands.",
    what_we_know: [
      { text: "Prior pilot with FreightWatch stalled at TMS integration", citation: cit },
    ],
    talking_points: [
      { text: "Run the exception queue live on brokerage-shaped data", citation: cit },
    ],
    risks: [{ text: "IT capacity is thin", citation: cit }],
    citations: [cit],
    unsourced_claims: [],
  };

  it("accepts a well-formed brief output", () => {
    expect(validateBriefOutput(good).valid).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    const bad = { ...good, extra: 1 } as unknown;
    const r = validateBriefOutput(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/additional/i);
  });

  it("rejects a what_we_know item missing its citation", () => {
    const bad = { ...good, what_we_know: [{ text: "x" }] } as unknown;
    expect(validateBriefOutput(bad).valid).toBe(false);
  });

  it("rejects a missing unsourced_claims key", () => {
    const bad: Record<string, unknown> = { ...good };
    delete bad.unsourced_claims;
    expect(validateBriefOutput(bad).valid).toBe(false);
  });

  it("rejects a citation missing quote (JC2 — span alone is not enough)", () => {
    const citNoQuote = { path: DISCOVERY_NOTE, span: [10, 40] as [number, number] };
    const bad = { ...good, citations: [citNoQuote] } as unknown;
    const r = validateBriefOutput(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/quote/i);
  });
});

describe("call-prep impl (stubbed model)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "../../../..");
  const contextRoot = join(repoRoot, "examples/demo-corpus");
  const ACCOUNT = "acme-logistics";
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

  it("happy path: returns a valid BriefOutput with scopeResolved/contextRead covering the full multi-glob scope", async () => {
    const discoveryRaw = (
      await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")
    ).replace(/\r\n/g, "\n");
    const oppRaw = (
      await readFile(resolveContextPath(OPPORTUNITY_RECORD, contextRoot), "utf8")
    ).replace(/\r\n/g, "\n");

    // Pick a genuine verbatim substring from each of two different files so the
    // test actually exercises path-based multi-file citation matching, not just
    // a single shared note.
    const discoveryQuote = discoveryRaw.slice(0, 40).trim();
    const oppQuote = oppRaw.slice(0, 40).trim();

    const stub = JSON.stringify({
      goal: "Get IT comfortable with the integration and put a concrete SOW in Dana's hands.",
      what_we_know: [
        {
          text: "From discovery",
          citation: { path: DISCOVERY_NOTE, quote: discoveryQuote },
        },
      ],
      talking_points: [
        {
          text: "From the opportunity record",
          citation: { path: OPPORTUNITY_RECORD, quote: oppQuote },
        },
      ],
      risks: [],
      citations: [
        { path: DISCOVERY_NOTE, quote: discoveryQuote },
        { path: OPPORTUNITY_RECORD, quote: oppQuote },
      ],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-prep");
    const res = await callPrepImpl.run(
      { account_slug: ACCOUNT, opp_id: OPP },
      { loader, scopeParams: { accountSlug: ACCOUNT, oppId: OPP } },
      def,
    );
    const out = res.output as BriefOutput;

    expect(validateBriefOutput(out).valid).toBe(true);

    // The read grant spans meetings/**, opportunity.md, artifacts/**, account.md,
    // people/**, org/**, demand-gen/** — multiple files, not one anchored document.
    expect(res.scopeResolved.length).toBeGreaterThan(5);
    expect(res.scopeResolved).toContain(DISCOVERY_NOTE);
    expect(res.scopeResolved).toContain(OPPORTUNITY_RECORD);
    expect(res.scopeResolved).toContain("context/org/company.md");
    expect(res.scopeResolved).toContain("context/demand-gen/icp/account.md");
    // call-prep genuinely reads its whole resolved scope into the prompt.
    expect(res.contextRead).toEqual(res.scopeResolved);

    // Citation against the discovery note resolves against ITS text, not the
    // opportunity record's (and vice versa) — proves path-based lookup, not a
    // single shared "first file" assumption.
    const [ds, de] = out.what_we_know[0].citation.span;
    expect(discoveryRaw.slice(ds, de)).toBe(discoveryQuote);
    const [os, oe] = out.talking_points[0].citation.span;
    expect(oppRaw.slice(os, oe)).toBe(oppQuote);
  });

  it("retries up to 3 attempts on invalid/unparseable JSON then throws with a clear message", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue("not json at all, sorry");
    const def = await loadSkill("call-prep");
    await expect(
      callPrepImpl.run(
        { account_slug: ACCOUNT, opp_id: OPP },
        { loader, scopeParams: { accountSlug: ACCOUNT, oppId: OPP } },
        def,
      ),
    ).rejects.toThrow(/no valid output after \d+ attempts/i);
    expect(spy.mock.calls.length).toBe(3);
  });

  it("gives a citation quote not found verbatim in the named file an out-of-range span (no crash)", async () => {
    const discoveryRaw = (
      await readFile(resolveContextPath(DISCOVERY_NOTE, contextRoot), "utf8")
    ).replace(/\r\n/g, "\n");

    const stub = JSON.stringify({
      goal: "x",
      what_we_know: [],
      talking_points: [],
      risks: [],
      citations: [
        { path: DISCOVERY_NOTE, quote: "this exact phrase is definitely not in the note" },
      ],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-prep");
    const res = await callPrepImpl.run(
      { account_slug: ACCOUNT, opp_id: OPP },
      { loader, scopeParams: { accountSlug: ACCOUNT, oppId: OPP } },
      def,
    );
    const out = res.output as BriefOutput;
    expect(out.citations[0].span[0]).toBeGreaterThanOrEqual(discoveryRaw.length);
  });

  it("gives a citation whose path matches no file actually read an out-of-range span (no crash, no misattribution)", async () => {
    const oppRaw = (
      await readFile(resolveContextPath(OPPORTUNITY_RECORD, contextRoot), "utf8")
    ).replace(/\r\n/g, "\n");
    // Quote genuinely exists verbatim in the opportunity record, but the model
    // (hallucinating) attributes it to a path that was never read. This must not
    // silently resolve against the opportunity record's text.
    const realQuoteFromOpp = oppRaw.slice(0, 30).trim();

    const stub = JSON.stringify({
      goal: "x",
      what_we_know: [],
      talking_points: [],
      risks: [],
      citations: [
        {
          path: "context/accounts/acme-logistics/opportunities/does-not-exist.md",
          quote: realQuoteFromOpp,
        },
      ],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-prep");
    const res = await callPrepImpl.run(
      { account_slug: ACCOUNT, opp_id: OPP },
      { loader, scopeParams: { accountSlug: ACCOUNT, oppId: OPP } },
      def,
    );
    const out = res.output as BriefOutput;
    expect(out.citations[0].span[0]).toBeGreaterThanOrEqual(0);
    // Must be flagged unresolvable — an out-of-range span relative to whichever
    // (nonexistent) file text it would have been checked against.
    const [s, e] = out.citations[0].span;
    expect(e).toBeGreaterThan(s);
    // It must not equal a valid, in-range resolution against the opportunity
    // record's text (which would indicate the wrong file was searched).
    expect(oppRaw.slice(s, e)).not.toBe(realQuoteFromOpp);
  });

  it("handles meeting_context being absent (optional input)", async () => {
    const stub = JSON.stringify({
      goal: "x",
      what_we_know: [],
      talking_points: [],
      risks: [],
      citations: [],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-prep");
    const res = await callPrepImpl.run(
      { account_slug: ACCOUNT, opp_id: OPP },
      { loader, scopeParams: { accountSlug: ACCOUNT, oppId: OPP } },
      def,
    );
    expect(validateBriefOutput(res.output).valid).toBe(true);
  });
});
