import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "./load.js";
import { validateAgainst } from "./validate.js";
import { isSchemaVersionAccepted, SCHEMA_TYPES } from "./registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "../../../../context/schema");

const common = {
  fictional: true,
  schema_version: "1.0.0",
  created: "2026-09-06T00:00:00Z",
  title: "t",
};

describe("schema registry", () => {
  it("loads and compiles every schema in context/schema", async () => {
    const reg = await loadSchemas(schemaDir);
    for (const type of SCHEMA_TYPES) {
      expect(reg.types()).toContain(type);
    }
  });

  it("accepts a well-formed org-company frontmatter", async () => {
    const reg = await loadSchemas(schemaDir);
    const res = validateAgainst(reg, "org-company", {
      ...common,
      mutability: "canonical",
      mission: "m",
      positioning: "p",
      segments: ["logistics"],
      differentiators: ["d"],
    });
    expect(res).toEqual({ valid: true, issues: [] });
  });

  it("rejects an unexpected property with a readable message", async () => {
    const reg = await loadSchemas(schemaDir);
    const res = validateAgainst(reg, "org-company", {
      ...common,
      mutability: "canonical",
      mission: "m",
      positioning: "p",
      segments: ["x"],
      differentiators: ["d"],
      rogue: 1,
    });
    expect(res.valid).toBe(false);
    expect(res.issues.join(" ")).toMatch(/unexpected property "rogue"/);
  });

  it("rejects a missing required field", async () => {
    const reg = await loadSchemas(schemaDir);
    const res = validateAgainst(reg, "clause", {
      ...common,
      mutability: "canonical",
      clause_id: "indemnity",
      topic: "x",
      position: "unacceptable",
      // rationale, standard_language, unacceptable_patterns, pattern_severity missing
    });
    expect(res.valid).toBe(false);
    expect(res.issues.join(" ")).toMatch(/rationale/);
  });

  it("enforces the finding blocker -> suggested_redline conditional", async () => {
    const reg = await loadSchemas(schemaDir);
    const base = {
      finding_id: "f-001",
      document: "context/accounts/x/opportunities/y/inbound/z.md",
      locator: { clause: "9.3", span: [10, 40] },
      issue: "uncapped indemnity",
      severity: "blocker",
      position: "unacceptable",
      citation: { path: "context/legal/clause-library/indemnity.md", span: [22, 41] },
      confidence: 0.9,
    };
    expect(validateAgainst(reg, "finding", base).valid).toBe(false);
    expect(validateAgainst(reg, "finding", { ...base, suggested_redline: "cap it" }).valid).toBe(
      true,
    );
    expect(validateAgainst(reg, "finding", { ...base, severity: "minor" }).valid).toBe(true);
  });

  it("validates outcome.json as a standalone (non-frontmatter) schema", async () => {
    const reg = await loadSchemas(schemaDir);
    expect(
      validateAgainst(reg, "outcome", {
        date: "2026-09-10",
        artifact: "context/accounts/x/opportunities/y/artifacts/a-0002-proposal.md",
        outcome: "sent",
      }).valid,
    ).toBe(true);
    expect(
      validateAgainst(reg, "outcome", { date: "2026-09-10", artifact: "x", outcome: "maybe" })
        .valid,
    ).toBe(false);
  });
});

describe("isSchemaVersionAccepted", () => {
  it("accepts same major, minor <= current", () => {
    expect(isSchemaVersionAccepted("1.0.0", "1.0.0")).toBe(true);
    expect(isSchemaVersionAccepted("1.0.5", "1.2.0")).toBe(true);
    expect(isSchemaVersionAccepted("1.2.0", "1.2.9")).toBe(true);
  });
  it("rejects a newer minor or a different major", () => {
    expect(isSchemaVersionAccepted("1.3.0", "1.2.0")).toBe(false);
    expect(isSchemaVersionAccepted("2.0.0", "1.2.0")).toBe(false);
    expect(isSchemaVersionAccepted("0.9.0", "1.0.0")).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isSchemaVersionAccepted("v1", "1.0.0")).toBe(false);
  });
});
