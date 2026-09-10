import { afterEach, describe, expect, it, beforeAll, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLoader, type ContextLoader } from "@agentic-sales-hub/context-core";
import { listSkills, loadSkill } from "./registry.js";
import { runSkill, validateInput } from "./runner.js";
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
    taintLedgerPath: join(here, "../../../.claude/.taint-ledger.test.jsonl"),
  });
});

describe("skill registry", () => {
  it("loads all three product skill definitions", async () => {
    const skills = await listSkills();
    expect(skills.map((s) => s.id).sort()).toEqual(["call-summary", "find-evidence", "sow-review"]);
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
