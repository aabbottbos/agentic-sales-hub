import { afterEach, describe, expect, it, beforeAll, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createLoader, type ContextLoader } from "@agentic-sales-hub/context-core";
import { listSkills, loadSkill } from "./registry.js";
import { runSkill, validateInput, flattenCitations } from "./runner.js";
import { normalizeWithMap } from "./impl/sow-review.js";
import * as llm from "./impl/llm.js";
import type { Finding, RetrievalHit } from "@agentic-sales-hub/context-core";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

const OPP = "006Ax0000GkLmNpQAA";
const oppDir = `context/accounts/acme-logistics/opportunities/${OPP}`;
const msaRedline = `${oppDir}/inbound/2026-09-02-acme-msa-redline.md`;
const sowRedline = `${oppDir}/inbound/2026-09-04-acme-sow-redline.md`;

let loader: ContextLoader;
beforeAll(async () => {
  loader = await createLoader({
    repoRoot,
    root: join(repoRoot, "examples/demo-corpus"),
    taintLedgerPath: join(here, "../../../.claude/.taint-ledger.test.jsonl"),
  });
});

describe("skill registry", () => {
  it("loads all four product skill definitions", async () => {
    const skills = await listSkills();
    expect(skills.map((s) => s.id).sort()).toEqual([
      "call-prep",
      "call-summary",
      "find-evidence",
      "sow-review",
    ]);
  });

  it("sow-review has no write grant", async () => {
    const def = await loadSkill("sow-review");
    expect(def.tier).toBe("review");
    expect(def.context_grants.write).toBeUndefined();
  });

  it("call-summary is a generation skill, meetings read grant only, no write grant", async () => {
    const def = await loadSkill("call-summary");
    expect(def.tier).toBe("generation");
    expect(def.context_grants.read).toEqual(["context/accounts/*/opportunities/*/meetings/**"]);
    expect(def.context_grants.write).toBeUndefined();
    expect(def.tools).toEqual(["context.read"]);
    expect(def.output.schema).toBe("context/schema/summary-output.json");
    expect(def.output.requires_citations).toBe(true);
  });

  it("call-prep is a generation skill with a wide read grant and a write grant, no legal glob", async () => {
    const def = await loadSkill("call-prep");
    expect(def.tier).toBe("generation");
    expect(def.context_grants.read).toEqual([
      "context/accounts/{account}/opportunities/{opp}/meetings/**",
      "context/accounts/{account}/opportunities/{opp}/opportunity.md",
      "context/accounts/{account}/opportunities/{opp}/artifacts/**",
      "context/accounts/{account}/account.md",
      "context/accounts/{account}/people/**",
      "context/org/**",
      "context/demand-gen/**",
    ]);
    expect(def.context_grants.read.some((g) => g.includes("legal"))).toBe(false);
    expect(def.context_grants.write).toEqual([
      "context/accounts/{account}/opportunities/{opp}/artifacts/**",
    ]);
    expect(def.tools).toEqual(["context.read", "artifact.write"]);
    expect(def.output.schema).toBe("context/schema/brief-output.json");
    expect(def.output.requires_citations).toBe(true);
  });

  it("throws for an unknown skill id", async () => {
    await expect(loadSkill("nope")).rejects.toThrow(/unknown skill/);
  });
});

describe("validateInput", () => {
  it("accepts a valid input and drops nothing required", async () => {
    const def = await loadSkill("find-evidence");
    expect(validateInput(def, { situation: "services scope" })).toEqual({
      situation: "services scope",
    });
  });
  it("rejects a missing required input", async () => {
    const def = await loadSkill("find-evidence");
    expect(() => validateInput(def, {})).toThrow(/missing required input "situation"/);
  });
  it("rejects a wrong-typed input", async () => {
    const def = await loadSkill("find-evidence");
    expect(() => validateInput(def, { situation: 5 })).toThrow(/expected string/);
  });
  it("rejects an unknown input", async () => {
    const def = await loadSkill("sow-review");
    expect(() => validateInput(def, { document_path: "x", bogus: 1 })).toThrow(/unknown input/);
  });
});

describe("normalizeWithMap", () => {
  it("collapses whitespace and maps indices back to raw", () => {
    const raw = "no\n  payment   for\nwork";
    const { normalized, mapToRaw } = normalizeWithMap(raw);
    expect(normalized).toBe("no payment for work");
    const idx = normalized.indexOf("payment");
    expect(raw.slice(mapToRaw(idx), mapToRaw(idx) + 7)).toBe("payment");
  });
});

describe("find-evidence (deterministic)", () => {
  it("returns cited hits for a services-scope situation, top result is relevant", async () => {
    const result = await runSkill(
      "find-evidence",
      { situation: "CFO worried the services engagement is too big; wants it carved down" },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );
    const hits = result.output as RetrievalHit[];
    expect(hits.length).toBeGreaterThan(0);
    expect(result.citationsValid).toBe(true);
    // relevant docs: cascade case study, implementation-services scope, historical brief
    const paths = hits.map((h) => h.path);
    expect(
      paths.some(
        (p) =>
          p.includes("cs-cascade-retail") ||
          p.includes("implementation-services") ||
          p.includes("a-0001-brief"),
      ),
    ).toBe(true);
  });

  it("never returns a legal/** or inbound/** file", async () => {
    const result = await runSkill(
      "find-evidence",
      { situation: "indemnity liability termination clause" },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );
    const hits = result.output as RetrievalHit[];
    expect(hits.every((h) => !h.path.startsWith("context/legal/"))).toBe(true);
    expect(hits.every((h) => !h.path.includes("/inbound/"))).toBe(true);
  });
});

describe("sow-review (deterministic)", () => {
  it("MSA redline: >= 3 blocker findings, each with a resolvable clause-library citation", async () => {
    const result = await runSkill(
      "sow-review",
      { document_path: msaRedline },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );
    const findings = result.output as Finding[];
    const blockers = findings.filter((f) => f.severity === "blocker");
    expect(blockers.length).toBeGreaterThanOrEqual(3);
    expect(result.citationsValid).toBe(true);
    for (const f of findings) {
      expect(f.citation.path).toMatch(/^context\/legal\/clause-library\//);
      const resolved = await loader.resolveCitation(f.citation);
      expect(resolved.text.length).toBeGreaterThan(0);
    }
    // the three named blockers
    const clauses = blockers.map((f) => f.citation.path);
    expect(clauses.some((c) => c.includes("indemnity"))).toBe(true);
    expect(clauses.some((c) => c.includes("limitation-of-liability"))).toBe(true);
    expect(clauses.some((c) => c.includes("ip-ownership"))).toBe(true);
  });

  it("SOW redline: >= 2 blocker findings; a blocker/major finding carries a suggested_redline", async () => {
    const result = await runSkill(
      "sow-review",
      { document_path: sowRedline },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );
    const findings = result.output as Finding[];
    expect(findings.filter((f) => f.severity === "blocker").length).toBeGreaterThanOrEqual(2);
    for (const f of findings) {
      if (f.severity === "blocker" || f.severity === "major") {
        expect(f.suggested_redline && f.suggested_redline.length).toBeTruthy();
      }
    }
  });

  it("locator spans point into the reviewed document", async () => {
    const result = await runSkill(
      "sow-review",
      { document_path: msaRedline },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );
    const findings = result.output as Finding[];
    const inbound = await loader.readInbound(msaRedline);
    const body = loader.extractUntrusted(inbound.wrapped);
    for (const f of findings) {
      const [s, e] = f.locator.span;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(e).toBeGreaterThan(s);
      expect(e).toBeLessThanOrEqual(body.length);
    }
  });
});

describe("runSkill generation branch (call-summary, stubbed)", () => {
  const discoveryNote = `${oppDir}/meetings/2026-07-14-discovery.md`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates output against summary-output.json and sets citationsValid", async () => {
    const quote = "ONE exception queue";
    const stub = JSON.stringify({
      summary: "Acme wants one exception queue.",
      commitments: [],
      next_steps: [
        {
          text: "SE technical deep dive with Acme IT",
          owner: "us",
          citation: { path: discoveryNote, quote },
        },
      ],
      context_deltas: [],
      citations: [{ path: discoveryNote, quote }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const result = await runSkill(
      "call-summary",
      { meeting_path: discoveryNote },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );

    expect(result.citationsValid).toBe(true);
    expect((result.output as { summary: string }).summary).toContain("exception queue");
  });

  it("fails the run when a citation quote is not in the note", async () => {
    const stub = JSON.stringify({
      summary: "x",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: discoveryNote, quote: "a phrase that does not appear anywhere" }],
      unsourced_claims: [],
    });
    vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const result = await runSkill(
      "call-summary",
      { meeting_path: discoveryNote },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
    );

    expect(result.citationsValid).toBe(false);
  });

  it("throws when the impl output never satisfies the schema", async () => {
    vi.spyOn(llm, "complete").mockResolvedValue('{"summary":"x"}');
    await expect(
      runSkill(
        "call-summary",
        { meeting_path: discoveryNote },
        { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      ),
    ).rejects.toThrow(/no valid output after \d+ attempts/i);
  });
});

describe("flattenCitations", () => {
  it("flattens call-summary-shaped output (citations nested under commitments/next_steps/context_deltas, plus a bare top-level citations[])", () => {
    const output = {
      summary: "x",
      commitments: [{ text: "a", owner: "us", citation: { path: "p1.md", span: [0, 5] } }],
      next_steps: [{ text: "b", owner: "us", citation: { path: "p2.md", span: [10, 15] } }],
      context_deltas: [
        { field: "risk", observation: "c", citation: { path: "p3.md", span: [20, 25] } },
      ],
      citations: [{ path: "p4.md", span: [30, 35] }],
      unsourced_claims: [],
    };
    const result = flattenCitations(output);
    const keys = result.map((c) => `${c.path}:${c.span[0]}-${c.span[1]}`).sort();
    expect(keys).toEqual(["p1.md:0-5", "p2.md:10-15", "p3.md:20-25", "p4.md:30-35"]);
  });

  it("flattens call-prep-shaped output (citations nested under what_we_know/talking_points/risks)", () => {
    const output = {
      goal: "x",
      what_we_know: [{ text: "a", citation: { path: "p1.md", quote: "a", span: [0, 5] } }],
      talking_points: [{ text: "b", citation: { path: "p2.md", quote: "b", span: [10, 15] } }],
      risks: [{ text: "c", citation: { path: "p3.md", quote: "c", span: [20, 25] } }],
      citations: [{ path: "p4.md", quote: "d", span: [30, 35] }],
      unsourced_claims: [],
    };
    const result = flattenCitations(output);
    const keys = result.map((c) => `${c.path}:${c.span[0]}-${c.span[1]}`).sort();
    expect(keys).toEqual(["p1.md:0-5", "p2.md:10-15", "p3.md:20-25", "p4.md:30-35"]);
  });

  it("de-duplicates the same {path, span} cited from multiple fields", () => {
    const shared = { path: "p1.md", span: [0, 5] };
    const output = {
      commitments: [{ citation: shared }],
      next_steps: [{ citation: shared }],
      context_deltas: [],
      citations: [shared],
    };
    const result = flattenCitations(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(shared);
  });

  it("does not throw on a legitimately citation-free output (citations: [], every item array [], unsourced_claims present) — returns []", () => {
    const output = {
      goal: "x",
      what_we_know: [],
      talking_points: [],
      risks: [],
      citations: [],
      unsourced_claims: ["x"],
    };
    expect(flattenCitations(output)).toEqual([]);
  });

  it("throws on an object with no citations array field at all and no array-of-cited-items field either", () => {
    const output = { goal: "x", note: "no citation-shaped field anywhere" };
    expect(() => flattenCitations(output)).toThrow(/no citation-shaped field/i);
  });

  it("throws when an item's .citation property exists but is malformed (missing span)", () => {
    const output = {
      goal: "x",
      what_we_know: [{ text: "a", citation: { path: "p1.md" } }],
      talking_points: [],
      risks: [],
      citations: [],
      unsourced_claims: [],
    };
    expect(() => flattenCitations(output)).toThrow(/malformed \.citation/i);
  });

  it("ignores non-citation array fields (e.g. unsourced_claims: string[]) without throwing", () => {
    const output = {
      goal: "x",
      what_we_know: [],
      talking_points: [],
      risks: [],
      citations: [{ path: "p1.md", span: [0, 5] }],
      unsourced_claims: ["claim one", "claim two"],
    };
    const result = flattenCitations(output);
    expect(result).toEqual([{ path: "p1.md", span: [0, 5] }]);
  });
});

describe("runSkill generation branch (call-prep, stubbed, scratch corpus)", () => {
  /** mkdtemp + cp of examples/demo-corpus/ — the first place the skills
   *  package's tests need a real-write scratch copy (writeArtifact() writes
   *  a new file under artifacts/, which must not land in the committed
   *  demo-corpus). */
  async function scratchCorpus(): Promise<{ tmpDir: string; loader: ContextLoader }> {
    const tmpDir = await mkdtemp(join(tmpdir(), "call-prep-"));
    const corpusRoot = join(tmpDir, "demo-corpus");
    await cp(join(repoRoot, "examples/demo-corpus"), corpusRoot, { recursive: true });
    const scratchLoader = await createLoader({
      repoRoot,
      root: corpusRoot,
      taintLedgerPath: join(tmpDir, ".taint-ledger.jsonl"),
    });
    return { tmpDir, loader: scratchLoader };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists a valid BriefOutput as an artifact; citationsValid true, artifactPath returned, artifact readable back", async () => {
    const { tmpDir, loader: scratchLoader } = await scratchCorpus();
    try {
      const raw = await readFile(join(tmpDir, "demo-corpus/org/company.md"), "utf8");
      const quoteStart = raw.indexOf("Meridian Grid is a mid-market B2B company");
      const quote = raw.slice(
        quoteStart,
        quoteStart + "Meridian Grid is a mid-market B2B company".length,
      );
      const citation = { path: "context/org/company.md", quote, span: [0, 0] as [number, number] };

      const stub = JSON.stringify({
        goal: "Confirm scope and champion alignment",
        what_we_know: [{ text: "Meridian sells a supply-chain visibility platform.", citation }],
        talking_points: [{ text: "Lead with the services attach.", citation }],
        risks: [{ text: "Budget owner not yet confirmed.", citation }],
        citations: [{ path: "context/org/company.md", quote }],
        unsourced_claims: [],
      });
      vi.spyOn(llm, "complete").mockResolvedValue(stub);

      const result = await runSkill(
        "call-prep",
        { account_slug: "acme-logistics", opp_id: OPP },
        { loader: scratchLoader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      );

      expect(result.citationsValid).toBe(true);
      expect(result.artifactPath).toMatch(
        new RegExp(
          `^context/accounts/acme-logistics/opportunities/${OPP}/artifacts/a-\\d{4}-brief\\.md$`,
        ),
      );

      const written = await readFile(
        join(tmpDir, "demo-corpus", result.artifactPath!.replace(/^context\//, "")),
        "utf8",
      );
      expect(written).toContain("generated_by: call-prep");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to persist when a citation quote cannot be found (out-of-range span) — citationsValid false, writeArtifact not called, throws", async () => {
    const { tmpDir, loader: scratchLoader } = await scratchCorpus();
    try {
      const badCitation = {
        path: "context/org/company.md",
        quote: "this exact phrase does not appear anywhere in the corpus",
        span: [0, 0] as [number, number],
      };
      const stub = JSON.stringify({
        goal: "x",
        what_we_know: [{ text: "a", citation: badCitation }],
        talking_points: [],
        risks: [],
        citations: [],
        unsourced_claims: [],
      });
      vi.spyOn(llm, "complete").mockResolvedValue(stub);
      const writeArtifactSpy = vi.spyOn(scratchLoader, "writeArtifact");

      await expect(
        runSkill(
          "call-prep",
          { account_slug: "acme-logistics", opp_id: OPP },
          { loader: scratchLoader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
        ),
      ).rejects.toThrow(/citation validity/i);

      expect(writeArtifactSpy).not.toHaveBeenCalled();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
