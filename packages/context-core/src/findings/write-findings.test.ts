import { describe, expect, it, beforeAll } from "vitest";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "../schema/load.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { readContextFile } from "../fs/read.js";
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

async function tempCorpus(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wf-"));
  await cp(fixturesRoot, dir, { recursive: true });
  return dir;
}

describe("writeFindings", () => {
  it("writes a valid findings artifact that itself validates", async () => {
    const root = await tempCorpus();
    try {
      const { artifactPath } = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { repoRoot: root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      expect(artifactPath).toMatch(/\/artifacts\/.*-findings\.md$/);
      const file = await readContextFile(artifactPath, { repoRoot: root, registry });
      expect(file.schemaType).toBe("artifact");
      expect(file.frontmatter.kind).toBe("findings");
      expect(file.frontmatter.source_document).toBe(sourceDoc);
      expect(String(file.frontmatter.source_hash)).toMatch(/^[a-f0-9]{64}$/);
      expect(file.body).toContain("Not legal advice");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("never overwrites an existing artifact (append-only)", async () => {
    const root = await tempCorpus();
    try {
      const args = {
        accountSlug: "fix-co",
        crmId: OPP,
        sourceDocument: sourceDoc,
        findings: [blocker],
        artifactId: "f-fixed",
      };
      await writeFindings(args, { repoRoot: root, registry });
      await expect(writeFindings(args, { repoRoot: root, registry })).rejects.toBeInstanceOf(
        AppendOnlyViolationError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("two default-id writes produce two distinct files", async () => {
    const root = await tempCorpus();
    try {
      const a = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { repoRoot: root, registry, now: () => new Date("2026-09-18T12:00:00Z") },
      );
      const b = await writeFindings(
        { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [blocker] },
        { repoRoot: root, registry, now: () => new Date("2026-09-18T12:05:30Z") },
      );
      expect(a.artifactPath).not.toBe(b.artifactPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a finding that fails its schema", async () => {
    const root = await tempCorpus();
    try {
      const bad = { ...blocker, severity: "blocker" as const, suggested_redline: undefined };
      await expect(
        writeFindings(
          { accountSlug: "fix-co", crmId: OPP, sourceDocument: sourceDoc, findings: [bad] },
          { repoRoot: root, registry },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("appendOutcome", () => {
  it("appends a validated outcome line", async () => {
    const root = await tempCorpus();
    try {
      const { outcomesPath } = await appendOutcome(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          artifact: `context/accounts/fix-co/opportunities/${OPP}/artifacts/a-0001-brief.md`,
          outcome: "superseded",
          date: "2026-09-18",
        },
        { repoRoot: root, registry },
      );
      const text = await readFile(join(root, outcomesPath), "utf8");
      const lines = text.trim().split("\n");
      expect(JSON.parse(lines.at(-1)!)).toMatchObject({
        outcome: "superseded",
        date: "2026-09-18",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an invalid outcome enum", async () => {
    const root = await tempCorpus();
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
          { repoRoot: root, registry },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
