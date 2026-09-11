import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveCitation } from "./resolve-citation.js";
import { verifyCitation } from "./verify-citation.js";
import { CitationUnresolvableError } from "../errors.js";
import { normalizeNewlines } from "../frontmatter/parse.js";
import { resolveContextPath } from "../fs/resolve-path.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "../../test/fixtures/context");

const indemnityPath = "context/legal/clause-library/indemnity.md";
const liabilityPath = "context/legal/clause-library/liability.md";

async function spanOf(relPath: string, needle: string): Promise<[number, number]> {
  const raw = normalizeNewlines(await readFile(resolveContextPath(relPath, fixturesRoot), "utf8"));
  const start = raw.indexOf(needle);
  if (start < 0) throw new Error(`needle not found: ${needle}`);
  return [start, start + needle.length];
}

describe("resolveCitation", () => {
  it("resolves a span to exact text with surrounding context", async () => {
    const span = await spanOf(indemnityPath, "capped at trailing twelve months fees");
    const r = await resolveCitation({ path: indemnityPath, span }, fixturesRoot);
    expect(r.text).toBe("capped at trailing twelve months fees");
    expect(r.contextBefore.length).toBeGreaterThan(0);
    expect(r.contextAfter.length).toBeGreaterThan(0);
  });

  it("throws on a span past end of file", async () => {
    await expect(
      resolveCitation({ path: indemnityPath, span: [0, 10_000_000] }, fixturesRoot),
    ).rejects.toBeInstanceOf(CitationUnresolvableError);
  });

  it("throws on an inverted span", async () => {
    await expect(
      resolveCitation({ path: indemnityPath, span: [50, 10] }, fixturesRoot),
    ).rejects.toBeInstanceOf(CitationUnresolvableError);
  });

  it("throws on a missing file", async () => {
    await expect(
      resolveCitation({ path: "context/legal/clause-library/nope.md", span: [0, 1] }, fixturesRoot),
    ).rejects.toBeInstanceOf(CitationUnresolvableError);
  });
});

describe("verifyCitation — position", () => {
  it("valid when the cited clause position matches the claimed position", async () => {
    const span = await spanOf(indemnityPath, "Uncapped indemnity is a blocker.");
    const v = await verifyCitation(
      { path: indemnityPath, span },
      { kind: "position", position: "unacceptable" },
      fixturesRoot,
    );
    expect(v.valid).toBe(true);
  });

  it("invalid when the claimed position differs from the clause position", async () => {
    const span = await spanOf(liabilityPath, "capped at trailing twelve months fees");
    const v = await verifyCitation(
      { path: liabilityPath, span },
      { kind: "position", position: "acceptable" }, // clause says unacceptable
      fixturesRoot,
    );
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/position/);
  });

  it("invalid when the citation points outside the clause library", async () => {
    const v = await verifyCitation(
      { path: "context/legal/guidance.md", span: [0, 5] },
      { kind: "position", position: "unacceptable" },
      fixturesRoot,
    );
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/clause-library/);
  });

  it("invalid when the citation does not resolve at all", async () => {
    const v = await verifyCitation(
      { path: indemnityPath, span: [0, 9_999_999] },
      { kind: "position", position: "unacceptable" },
      fixturesRoot,
    );
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/does not resolve/);
  });
});

describe("verifyCitation — assertion", () => {
  it("valid when cited text contains the assertion", async () => {
    const span = await spanOf(indemnityPath, "Indemnity must be capped");
    const v = await verifyCitation(
      { path: indemnityPath, span },
      { kind: "assertion", text: "indemnity must be capped" },
      fixturesRoot,
    );
    expect(v.valid).toBe(true);
  });

  it("invalid when cited text does not contain the assertion", async () => {
    const span = await spanOf(indemnityPath, "Indemnity must be capped");
    const v = await verifyCitation(
      { path: indemnityPath, span },
      { kind: "assertion", text: "payment terms are net 30" },
      fixturesRoot,
    );
    expect(v.valid).toBe(false);
  });
});
