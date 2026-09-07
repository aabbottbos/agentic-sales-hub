import { describe, expect, it } from "vitest";
import { classify, isContextFile } from "./classify.js";
import { normalizeNewlines, parseFrontmatter } from "./parse.js";

describe("classify", () => {
  const cases: Array<[string, string, string, boolean]> = [
    ["context/org/company.md", "org-company", "canonical", false],
    ["context/org/offerings/platform.md", "org-offering", "canonical", false],
    ["context/org/pricing.md", "pricing", "canonical", false],
    ["context/org/evidence/cs-midwest-freight.md", "evidence", "canonical", false],
    ["context/demand-gen/icp/account.md", "icp-account", "canonical", false],
    ["context/demand-gen/icp/buyer.md", "icp-buyer", "canonical", false],
    ["context/legal/guidance.md", "legal-guidance", "canonical", false],
    ["context/legal/clause-library/indemnity.md", "clause", "canonical", false],
    ["context/accounts/acme-logistics/account.md", "account", "accumulating", false],
    ["context/accounts/acme-logistics/people/dana-reyes.md", "person", "accumulating", false],
    [
      "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/opportunity.md",
      "opportunity",
      "accumulating",
      false,
    ],
    [
      "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md",
      "meeting",
      "accumulating",
      false,
    ],
    [
      "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/artifacts/a-0001-brief.md",
      "artifact",
      "accumulating",
      false,
    ],
    [
      "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/inbound/2026-09-02-acme-msa-redline.md",
      "inbound",
      "accumulating",
      true,
    ],
  ];

  for (const [path, schemaType, mutability, quarantined] of cases) {
    it(`classifies ${path}`, () => {
      expect(classify(path)).toEqual({ schemaType, mutability, quarantined });
    });
  }

  it("returns null for an unrecognized context path", () => {
    expect(
      classify("context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/notes.md"),
    ).toBeNull();
    expect(classify("context/random/thing.md")).toBeNull();
  });

  it("does not classify outcomes.jsonl", () => {
    expect(
      classify("context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/outcomes.jsonl"),
    ).toBeNull();
  });

  it("isContextFile excludes the schema dir", () => {
    expect(isContextFile("context/org/company.md")).toBe(true);
    expect(isContextFile("context/schema/clause.json")).toBe(false);
    expect(isContextFile("packages/context-core/src/index.ts")).toBe(false);
  });
});

describe("parseFrontmatter", () => {
  it("parses frontmatter and body, LF-normalized", () => {
    const text = "---\r\ntitle: Hi\r\nfictional: true\r\n---\r\n\r\nBody line.\r\n";
    const p = parseFrontmatter(text);
    expect(p.hasFrontmatter).toBe(true);
    expect(p.data).toEqual({ title: "Hi", fictional: true });
    expect(p.body).toBe("Body line.\n");
    expect(p.raw).toBe("---\ntitle: Hi\nfictional: true\n---\n\nBody line.\n");
  });

  it("handles a file with no frontmatter", () => {
    const p = parseFrontmatter("just text\n");
    expect(p.hasFrontmatter).toBe(false);
    expect(p.data).toEqual({});
    expect(p.body).toBe("just text\n");
  });

  it("throws on malformed YAML frontmatter", () => {
    expect(() => parseFrontmatter("---\ntitle: : :\n bad\n---\nx\n")).toThrow(/frontmatter/);
  });

  it("normalizeNewlines collapses CRLF and CR", () => {
    expect(normalizeNewlines("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });
});
