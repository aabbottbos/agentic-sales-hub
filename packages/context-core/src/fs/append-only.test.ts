import { describe, expect, it } from "vitest";
import { assertAppendOnly, frontmatterDelta } from "./append-only.js";
import { AppendOnlyViolationError } from "../errors.js";

const opp = "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA";

describe("assertAppendOnly", () => {
  it("ignores canonical context entirely", () => {
    expect(() => assertAppendOnly("context/legal/guidance.md", "modify")).not.toThrow();
    expect(() => assertAppendOnly("context/org/pricing.md", "delete")).not.toThrow();
  });

  it("allows create anywhere under an opportunity", () => {
    expect(() => assertAppendOnly(`${opp}/artifacts/a-0009-findings.md`, "create")).not.toThrow();
    expect(() => assertAppendOnly(`${opp}/meetings/2026-09-30-qbr.md`, "create")).not.toThrow();
  });

  it("rejects delete of anything under an opportunity", () => {
    expect(() => assertAppendOnly(`${opp}/artifacts/a-0001-brief.md`, "delete")).toThrow(
      AppendOnlyViolationError,
    );
    expect(() => assertAppendOnly(`${opp}/meetings/2026-07-14-discovery.md`, "delete")).toThrow(
      AppendOnlyViolationError,
    );
  });

  it("rejects modify of a meeting note, inbound doc, or outcomes.jsonl", () => {
    expect(() => assertAppendOnly(`${opp}/meetings/2026-07-14-discovery.md`, "modify")).toThrow(
      AppendOnlyViolationError,
    );
    expect(() => assertAppendOnly(`${opp}/inbound/2026-09-02-msa.md`, "modify")).toThrow(
      AppendOnlyViolationError,
    );
    expect(() => assertAppendOnly(`${opp}/outcomes.jsonl`, "modify")).toThrow(
      AppendOnlyViolationError,
    );
  });

  it("allows an artifact modify that only flips superseded false -> true", () => {
    const delta = frontmatterDelta(
      { superseded: false, kind: "proposal" },
      { superseded: true, kind: "proposal" },
    );
    expect(() =>
      assertAppendOnly(`${opp}/artifacts/a-0002-proposal.md`, "modify", delta),
    ).not.toThrow();
  });

  it("rejects an artifact modify that changes anything else", () => {
    const bodyEdit = frontmatterDelta(
      { superseded: false, title: "old" },
      { superseded: false, title: "new" },
    );
    expect(() =>
      assertAppendOnly(`${opp}/artifacts/a-0002-proposal.md`, "modify", bodyEdit),
    ).toThrow(AppendOnlyViolationError);

    const both = frontmatterDelta(
      { superseded: false, title: "old" },
      { superseded: true, title: "new" },
    );
    expect(() => assertAppendOnly(`${opp}/artifacts/a-0002-proposal.md`, "modify", both)).toThrow(
      AppendOnlyViolationError,
    );
  });

  it("rejects an artifact modify with no delta supplied", () => {
    expect(() => assertAppendOnly(`${opp}/artifacts/a-0002-proposal.md`, "modify")).toThrow(
      AppendOnlyViolationError,
    );
  });

  it("rejects modifying opportunity.md / account.md / people", () => {
    expect(() => assertAppendOnly(`${opp}/opportunity.md`, "modify")).toThrow(
      AppendOnlyViolationError,
    );
  });
});

describe("frontmatterDelta", () => {
  it("reports only genuinely changed keys", () => {
    const d = frontmatterDelta({ a: 1, b: [1, 2], c: "x" }, { a: 1, b: [1, 2], c: "y", d: true });
    expect(d.changedKeys.sort()).toEqual(["c", "d"]);
  });
});
