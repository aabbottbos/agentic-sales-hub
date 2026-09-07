import { describe, expect, it, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "../schema/load.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { readContextFile, toRepoRelative } from "./read.js";
import { walkContext } from "./walk.js";
import { SchemaValidationError, SourceHashMismatchError, UnreadableError } from "../errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const schemaDir = join(repoRoot, "context/schema");
const fixturesRoot = join(here, "../../test/fixtures");

let registry: SchemaRegistry;
beforeAll(async () => {
  registry = await loadSchemas(schemaDir);
});

const opp = "context/accounts/fix-co/opportunities/006Ax0000GkLmNpQAA";

describe("walkContext", () => {
  it("lists the fixture context files, excludes schema, sorted", async () => {
    const files = await walkContext(fixturesRoot);
    expect(files).toEqual([...files].sort());
    expect(files).toContain("context/org/company.md");
    expect(files).toContain(`${opp}/inbound/2026-09-03-fixture-redline.md`);
    expect(files.some((f) => f.startsWith("context/schema/"))).toBe(false);
  });
});

describe("readContextFile", () => {
  it("reads and validates a canonical file", async () => {
    const f = await readContextFile("context/org/company.md", { repoRoot: fixturesRoot, registry });
    expect(f.schemaType).toBe("org-company");
    expect(f.mutability).toBe("canonical");
    expect(f.quarantined).toBe(false);
    expect(f.frontmatter.title).toBe("Fixture Co");
    expect(f.body.startsWith("Fixture company body.")).toBe(true);
    expect(f.bytes).toBeGreaterThan(0);
    expect(f.sourceHash).toBeUndefined();
  });

  it("reads an inbound file and verifies its source_hash", async () => {
    const f = await readContextFile(`${opp}/inbound/2026-09-03-fixture-redline.md`, {
      repoRoot: fixturesRoot,
      registry,
    });
    expect(f.schemaType).toBe("inbound");
    expect(f.quarantined).toBe(true);
    expect(f.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(f.frontmatter.source_hash).toBe(f.sourceHash);
  });

  it("throws SourceHashMismatchError for a tampered inbound file", async () => {
    await expect(
      readContextFile(`${opp}/inbound/2026-09-04-tampered.md`, {
        repoRoot: fixturesRoot,
        registry,
      }),
    ).rejects.toBeInstanceOf(SourceHashMismatchError);
  });

  it("throws SchemaValidationError for a classifiable file with no frontmatter", async () => {
    await expect(
      readContextFile("context/org/pricing.md", { repoRoot: fixturesRoot, registry }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("throws UnreadableError for a path that does not classify", async () => {
    await expect(
      readContextFile("context/org/bad-extra-field.md", { repoRoot: fixturesRoot, registry }),
    ).rejects.toBeInstanceOf(UnreadableError);
  });

  it("throws UnreadableError for a missing file at a classifiable path", async () => {
    await expect(
      readContextFile("context/org/company.md", { repoRoot: join(fixturesRoot, "nope"), registry }),
    ).rejects.toBeInstanceOf(UnreadableError);
  });
});

describe("toRepoRelative", () => {
  it("passes through a relative path and normalizes separators", () => {
    expect(toRepoRelative("/repo", "context/org/company.md")).toBe("context/org/company.md");
  });
  it("relativizes an absolute path", () => {
    expect(toRepoRelative("/repo", "/repo/context/org/company.md")).toBe("context/org/company.md");
  });
});
