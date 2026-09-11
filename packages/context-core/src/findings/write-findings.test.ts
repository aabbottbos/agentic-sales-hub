import { describe, expect, it, beforeAll } from "vitest";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "../schema/load.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { readContextFile } from "../fs/read.js";
import { resolveContextPath } from "../fs/resolve-path.js";
import { writeFindings } from "./write-findings.js";
import { appendOutcome } from "../outcomes/append-outcome.js";
import { AppendOnlyViolationError, SchemaValidationError } from "../errors.js";
import type { Finding } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const schemaDir = join(repoRoot, "context/schema");
const fixturesRoot = join(here, "../../test/fixtures");

const OPP = "006Ax0000GkLmNpQAA";
const sourceDoc = `context/accounts/fix-co/opportunities/${OPP}/inbound/2026-09-03-fixture-redline.md`;

let registry: SchemaRegistry;
beforeAll(async () => {
  registry = await loadSchemas(schemaDir);
});

const blocker: Finding = {
  finding_id: "f-001",
  document: sourceDoc,
  locator: { clause: "9.3", span: [10, 60] },
  issue: "Uncapped indemnity",
  severity: "blocker",
  position: "unacceptable",
  citation: { path: "context/legal/clause-library/indemnity.md", span: [200, 240] },
  suggested_redline: "Cap indemnity at trailing twelve months fees.",
  confidence: 0.9,
};

/**
 * Returns `{ tmpDir, root }`: `tmpDir` is the mkdtemp directory (pass to `rm` for
 * cleanup); `root` is the PHYSICAL corpus root inside it (a copy of
 * `test/fixtures/context`), named `context` — the "does it still work at a
 * context-named root" case. `tempCorpusAt` below covers a non-`context`-named root.
 */
async function tempCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "wf-"));
  await cp(fixturesRoot, tmpDir, { recursive: true });
  return { tmpDir, root: join(tmpDir, "context") };
}

/** Same as `tempCorpus`, but the physical root is named `demo-root`, not `context`. */
async function tempCorpusAt(dirName: string): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "wf-"));
  const root = join(tmpDir, dirName);
  await cp(join(fixturesRoot, "context"), root, { recursive: true });
  return { tmpDir, root };
}

describe("writeFindings", () => {
  it("writes a valid findings artifact that itself validates", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { artifactPath } = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      expect(artifactPath).toMatch(/\/artifacts\/.*-findings\.md$/);
      const file = await readContextFile(artifactPath, { root, registry });
      expect(file.schemaType).toBe("artifact");
      expect(file.frontmatter.kind).toBe("findings");
      expect(file.frontmatter.source_document).toBe(sourceDoc);
      expect(String(file.frontmatter.source_hash)).toMatch(/^[a-f0-9]{64}$/);
      expect(file.body).toContain("Not legal advice");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("never overwrites an existing artifact (append-only)", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const args = {
        accountSlug: "fix-co",
        crmId: OPP,
        sourceDocument: sourceDoc,
        findings: [blocker],
        artifactId: "f-fixed",
      };
      await writeFindings(args, { root, registry });
      await expect(writeFindings(args, { root, registry })).rejects.toBeInstanceOf(
        AppendOnlyViolationError,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("two default-id writes produce two distinct files", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const a = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      const b = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { root, registry, now: () => new Date("2026-09-18T12:05:30Z") },
      );
      expect(a.artifactPath).not.toBe(b.artifactPath);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a finding that fails its schema", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const bad = { ...blocker, severity: "blocker" as const, suggested_redline: undefined };
      await expect(
        writeFindings(
          { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [bad] },
          { root, registry },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("lands the artifact under a non-context-named physical root, not under a literal context/ subdir", async () => {
    const { tmpDir, root } = await tempCorpusAt("demo-root");
    try {
      const { artifactPath } = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      const expectedAbs = join(
        root,
        "accounts/fix-co/opportunities",
        OPP,
        "artifacts",
        artifactPath.split("/").at(-1)!,
      );
      expect(existsSync(expectedAbs)).toBe(true);
      expect(existsSync(join(root, "context", "accounts"))).toBe(false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("appendOutcome", () => {
  it("appends a validated outcome line", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { outcomesPath } = await appendOutcome(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          artifact: `context/accounts/fix-co/opportunities/${OPP}/artifacts/a-0001-brief.md`,
          outcome: "superseded",
          date: "2026-09-18",
        },
        { root, registry },
      );
      const text = await readFile(resolveContextPath(outcomesPath, root), "utf8");
      const lines = text.trim().split("\n");
      expect(JSON.parse(lines.at(-1)!)).toMatchObject({
        outcome: "superseded",
        date: "2026-09-18",
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects an invalid outcome enum", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        appendOutcome(
          // @ts-expect-error deliberately bad enum
          {
            accountSlug: "fix-co",
            crmId: OPP,
            artifact: "x",
            outcome: "maybe",
            date: "2026-09-18",
          },
          { root, registry },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
