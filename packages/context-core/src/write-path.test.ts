import { describe, expect, it, beforeAll } from "vitest";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "./schema/load.js";
import type { SchemaRegistry } from "./schema/registry.js";
import { readContextFile } from "./fs/read.js";
import { resolveContextPath } from "./fs/resolve-path.js";
import { writeArtifact } from "./write-path.js";
import { AppendOnlyViolationError, ScopeViolationError, SchemaValidationError } from "./errors.js";
import type { ArtifactCitationInput } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const schemaDir = join(repoRoot, "context/schema");
const fixturesRoot = join(here, "../test/fixtures");

const OPP = "006Ax0000GkLmNpQAA";

let registry: SchemaRegistry;
beforeAll(async () => {
  registry = await loadSchemas(schemaDir);
});

const citation: ArtifactCitationInput = {
  claim: "Services scope is a common concern.",
  path: "context/org/company.md",
  span: [0, 20],
};

/** Same tempCorpus() helper as write-findings.test.ts (mkdtemp + cp of test/fixtures/). */
async function tempCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "wa-"));
  await cp(fixturesRoot, tmpDir, { recursive: true });
  return { tmpDir, root: join(tmpDir, "context") };
}

describe("writeArtifact", () => {
  it("writes a valid artifact that re-validates against artifact.json", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { artifactPath, artifactId } = await writeArtifact(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          kind: "brief",
          generatedBy: "call-prep",
          title: "Call brief for Acme discovery",
          body: "\nSome generated prose body.\n",
          citations: [citation],
        },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      expect(artifactPath).toMatch(/\/artifacts\/.*-brief\.md$/);
      const file = await readContextFile(artifactPath, { root, registry });
      expect(file.schemaType).toBe("artifact");
      expect(file.frontmatter.kind).toBe("brief");
      expect(file.frontmatter.generated_by).toBe("call-prep");
      expect(file.frontmatter.superseded).toBe(false);
      expect(file.frontmatter.artifact_id).toBe(artifactId);
      expect(file.body).toContain("Some generated prose body.");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("mints the next sequential id when a-0001-brief.md already exists in the fixture", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { artifactId } = await writeArtifact(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          kind: "brief",
          generatedBy: "call-prep",
          title: "Second brief",
          body: "Body.",
          citations: [citation],
        },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      expect(artifactId).not.toBe("a-0001");
      expect(artifactId).toBe("a-0002");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("auto-opens an unused outcome record for the new artifact path", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { artifactPath } = await writeArtifact(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          kind: "summary",
          generatedBy: "call-summary",
          title: "Call summary",
          body: "Summary body.",
          citations: [citation],
        },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      const outcomesPath = `context/accounts/fix-co/opportunities/${OPP}/outcomes.jsonl`;
      const text = await readFile(resolveContextPath(outcomesPath, root), "utf8");
      const lines = text.trim().split("\n");
      const last = JSON.parse(lines.at(-1)!);
      expect(last).toMatchObject({
        artifact: artifactPath,
        outcome: "unused",
        date: "2026-09-18",
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown kind with SchemaValidationError", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        writeArtifact(
          {
            accountSlug: "fix-co",
            crmId: OPP,
            kind: "not-a-real-kind",
            generatedBy: "call-prep",
            title: "Bad kind",
            body: "Body.",
            citations: [citation],
          },
          { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("an explicit artifactId collision throws AppendOnlyViolationError and never overwrites", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        writeArtifact(
          {
            accountSlug: "fix-co",
            crmId: OPP,
            kind: "brief",
            generatedBy: "call-prep",
            title: "Colliding brief",
            body: "New body that must not land.",
            citations: [citation],
            artifactId: "a-0001",
          },
          { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
        ),
      ).rejects.toBeInstanceOf(AppendOnlyViolationError);

      // original fixture content is untouched
      const original = await readFile(
        resolveContextPath(
          `context/accounts/fix-co/opportunities/${OPP}/artifacts/a-0001-brief.md`,
          root,
        ),
        "utf8",
      );
      expect(original).not.toContain("New body that must not land.");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("5 concurrent writeArtifact() calls with no explicit id mint 5 distinct ids", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          writeArtifact(
            {
              accountSlug: "fix-co",
              crmId: OPP,
              kind: "brief",
              generatedBy: "call-prep",
              title: `Concurrent brief ${i}`,
              body: `Body ${i}.`,
              citations: [citation],
            },
            { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
          ),
        ),
      );
      const ids = results.map((r) => r.artifactId);
      expect(new Set(ids).size).toBe(5);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts existing valid slugs unchanged (acme-logistics / 006Ax0000GkLmNpQAA)", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { artifactPath } = await writeArtifact(
        {
          accountSlug: "acme-logistics",
          crmId: "006Ax0000GkLmNpQAA",
          kind: "brief",
          generatedBy: "call-prep",
          title: "Valid slug happy path",
          body: "Body.",
          citations: [citation],
        },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      expect(artifactPath).toBe(
        "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/artifacts/a-0001-brief.md",
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a path-traversal accountSlug before any filesystem write happens", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        writeArtifact(
          {
            accountSlug: "../../../etc",
            crmId: OPP,
            kind: "brief",
            generatedBy: "call-prep",
            title: "Malicious slug",
            body: "Body.",
            citations: [citation],
          },
          { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
        ),
      ).rejects.toBeInstanceOf(ScopeViolationError);

      // the escape target was never created, and the fixture corpus tree is untouched
      const etcDir = join(tmpDir, "etc");
      await expect(readdir(etcDir)).rejects.toMatchObject({ code: "ENOENT" });
      const accountsDir = await readdir(join(root, "accounts"));
      expect(accountsDir).toEqual(["fix-co"]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a crmId containing a `..` segment", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        writeArtifact(
          {
            accountSlug: "fix-co",
            crmId: "../../etc",
            kind: "brief",
            generatedBy: "call-prep",
            title: "Malicious crmId",
            body: "Body.",
            citations: [citation],
          },
          { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
        ),
      ).rejects.toBeInstanceOf(ScopeViolationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it.each([
    ["accountSlug", "fix/co"],
    ["accountSlug", "fix\\co"],
    ["crmId", "006A/x000"],
    ["crmId", "006A\\x000"],
  ])("rejects a %s containing a separator character (%s)", async (field, badValue) => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const args = {
        accountSlug: field === "accountSlug" ? badValue : "fix-co",
        crmId: field === "crmId" ? badValue : OPP,
        kind: "brief",
        generatedBy: "call-prep",
        title: "Malicious separator",
        body: "Body.",
        citations: [citation],
      };
      await expect(
        writeArtifact(args, { root, registry, now: () => new Date("2026-09-18T12:00:00Z") }),
      ).rejects.toBeInstanceOf(ScopeViolationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("succeeds with no context/org/templates/ directory present at all", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      // Fixture corpus has no context/org/templates/ dir — this exercises the no-op path.
      const { artifactPath } = await writeArtifact(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          kind: "proposal",
          generatedBy: "proposal-draft",
          title: "Draft proposal",
          body: "Proposal body.",
          citations: [citation],
        },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      expect(artifactPath).toMatch(/\/artifacts\/.*-proposal\.md$/);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
