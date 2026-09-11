import { describe, expect, it } from "vitest";
import { validateBriefOutput, type BriefOutput } from "./brief-schema.js";

const DISCOVERY_NOTE =
  "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md";

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
