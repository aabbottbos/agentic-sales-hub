import { describe, expect, it, beforeAll } from "vitest";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchemas } from "../schema/load.js";
import type { SchemaRegistry } from "../schema/registry.js";
import { resolveContextPath } from "../fs/resolve-path.js";
import { appendOutcome } from "./append-outcome.js";
import { SchemaValidationError } from "../errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const schemaDir = join(repoRoot, "context/schema");
const fixturesRoot = join(here, "../../test/fixtures");

const OPP = "006Ax0000GkLmNpQAA";
const artifact = `context/accounts/fix-co/opportunities/${OPP}/artifacts/a-0001-brief.md`;

let registry: SchemaRegistry;
beforeAll(async () => {
  registry = await loadSchemas(schemaDir);
});

/** `{ tmpDir, root }` — `root` is a physical corpus root named `context`, a copy of the fixtures. */
async function tempCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ao-"));
  await cp(fixturesRoot, tmpDir, { recursive: true });
  return { tmpDir, root: join(tmpDir, "context") };
}

/** Same, but the physical root is named `demo-root`, not `context`. */
async function tempCorpusAt(dirName: string): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ao-"));
  const root = join(tmpDir, dirName);
  await cp(join(fixturesRoot, "context"), root, { recursive: true });
  return { tmpDir, root };
}

describe("appendOutcome", () => {
  it("appends a valid outcome record and returns outcomesPath", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { outcomesPath } = await appendOutcome(
        { accountSlug: "fix-co", crmId: OPP, artifact, outcome: "won", date: "2026-09-18" },
        { root, registry },
      );
      expect(outcomesPath).toBe(`context/accounts/fix-co/opportunities/${OPP}/outcomes.jsonl`);
      const text = await readFile(resolveContextPath(outcomesPath, root), "utf8");
      const lines = text.trim().split("\n");
      expect(JSON.parse(lines.at(-1)!)).toMatchObject({
        date: "2026-09-18",
        artifact,
        outcome: "won",
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes an optional note when provided", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const { outcomesPath } = await appendOutcome(
        {
          accountSlug: "fix-co",
          crmId: OPP,
          artifact,
          outcome: "sent",
          date: "2026-09-18",
          note: "sent via email",
        },
        { root, registry },
      );
      const text = await readFile(resolveContextPath(outcomesPath, root), "utf8");
      expect(JSON.parse(text.trim().split("\n").at(-1)!)).toMatchObject({
        note: "sent via email",
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a record that fails outcome.json schema validation", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        appendOutcome(
          // @ts-expect-error deliberately bad enum value
          { accountSlug: "fix-co", crmId: OPP, artifact, outcome: "maybe", date: "2026-09-18" },
          { root, registry },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects a record missing a required field", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await expect(
        appendOutcome(
          // @ts-expect-error deliberately missing `date`
          { accountSlug: "fix-co", crmId: OPP, artifact, outcome: "won" },
          { root, registry },
        ),
      ).rejects.toBeInstanceOf(SchemaValidationError);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("append-only: two appends produce two lines, and neither line is rewritten", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      await appendOutcome(
        { accountSlug: "fix-co", crmId: OPP, artifact, outcome: "sent", date: "2026-09-17" },
        { root, registry },
      );
      const { outcomesPath } = await appendOutcome(
        { accountSlug: "fix-co", crmId: OPP, artifact, outcome: "won", date: "2026-09-18" },
        { root, registry },
      );
      const text = await readFile(resolveContextPath(outcomesPath, root), "utf8");
      const lines = text.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]!)).toMatchObject({ outcome: "sent", date: "2026-09-17" });
      expect(JSON.parse(lines[1]!)).toMatchObject({ outcome: "won", date: "2026-09-18" });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("lands outcomes.jsonl under a non-context-named physical root, not under a literal context/ subdir", async () => {
    const { tmpDir, root } = await tempCorpusAt("demo-root");
    try {
      const { outcomesPath } = await appendOutcome(
        { accountSlug: "fix-co", crmId: OPP, artifact, outcome: "won", date: "2026-09-18" },
        { root, registry },
      );
      const expectedAbs = join(root, `accounts/fix-co/opportunities/${OPP}/outcomes.jsonl`);
      expect(existsSync(expectedAbs)).toBe(true);
      expect(existsSync(join(root, "context", "accounts"))).toBe(false);
      expect(outcomesPath).toBe(`context/accounts/fix-co/opportunities/${OPP}/outcomes.jsonl`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
