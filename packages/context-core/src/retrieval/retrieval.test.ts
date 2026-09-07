import { describe, expect, it, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "../schema/load.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { readContextFile } from "../fs/read.js";
import { search } from "./search.js";
import { assertValidRetrievalResult } from "./result.js";
import type { ContextFile } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const schemaDir = join(repoRoot, "context/schema");
const fixturesRoot = join(here, "../../test/fixtures");

let registry: SchemaRegistry;
let scope: ContextFile[];

const OPP = "006Ax0000GkLmNpQAA";

beforeAll(async () => {
  registry = await loadSchemas(schemaDir);
  const paths = [
    "context/org/company.md",
    "context/demand-gen/icp/account.md",
    "context/legal/clause-library/indemnity.md",
    "context/legal/clause-library/liability.md",
    `context/accounts/fix-co/opportunities/${OPP}/artifacts/a-0001-brief.md`,
  ];
  scope = await Promise.all(
    paths.map((p) => readContextFile(p, { repoRoot: fixturesRoot, registry })),
  );
});

describe("search", () => {
  it("ranks the historical brief top for a services-scope query", () => {
    const hits = search(scope, "services scope onboarding concern", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.path).toContain("a-0001-brief.md");
    expect(hits[0]!.relevance).toBe(1);
    expect(hits[0]!.why).toMatch(/matched:/);
  });

  it("ranks the indemnity clause top for an indemnity query", () => {
    const hits = search(scope, "indemnification cap blocker", 5);
    expect(hits[0]!.path).toContain("indemnity.md");
  });

  it("returns [] for a query with no lexical overlap", () => {
    expect(search(scope, "quantum photosynthesis wombat", 5)).toEqual([]);
  });

  it("returns [] for an empty scope or empty query", () => {
    expect(search([], "anything", 5)).toEqual([]);
    expect(search(scope, "", 5)).toEqual([]);
  });

  it("respects k", () => {
    const hits = search(scope, "the a of to cap fees indemnity liability company", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("hit spans point into the file and are non-empty", () => {
    const [hit] = search(scope, "indemnification cap", 1);
    expect(hit).toBeDefined();
    const [start, end] = hit!.span;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
  });

  it("output satisfies the retrieval-result contract", () => {
    const hits = search(scope, "services scope", 5);
    expect(() => assertValidRetrievalResult(registry, hits)).not.toThrow();
    expect(() => assertValidRetrievalResult(registry, [])).not.toThrow();
  });

  it("assertValidRetrievalResult throws on a malformed result", () => {
    expect(() =>
      assertValidRetrievalResult(registry, [
        // @ts-expect-error deliberately malformed
        { path: "x", span: [0, 1], relevance: 2 },
      ]),
    ).toThrow(/output contract/);
  });
});
