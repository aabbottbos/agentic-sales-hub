import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCorpus } from "./validate-corpus.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const fixturesRoot = join(here, "../test/fixtures");

/** A temp repo: real context/schema + a copy of the fixture context/ tree. */
async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vc-"));
  await cp(join(repoRoot, "context/schema"), join(dir, "context/schema"), { recursive: true });
  await cp(join(fixturesRoot, "context"), join(dir, "context"), { recursive: true });
  return dir;
}

describe("validateCorpus", () => {
  it("passes on the clean fixture corpus", async () => {
    const root = await tempRepo();
    try {
      // the fixture set intentionally includes two files that must be errors:
      //   context/org/bad-extra-field.md  (unclassifiable path)
      //   context/org/pricing.md          (classifiable, no frontmatter)
      // remove them for the clean-pass assertion
      await rm(join(root, "context/org/bad-extra-field.md"));
      await rm(join(root, "context/org/pricing.md"));
      await rm(
        join(
          root,
          "context/accounts/fix-co/opportunities/006Ax0000GkLmNpQAA/inbound/2026-09-04-tampered.md",
        ),
      );

      const report = await validateCorpus(root);
      expect(report.errors).toEqual([]);
      expect(report.filesChecked).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("flags an unclassifiable context file", async () => {
    const root = await tempRepo();
    try {
      const report = await validateCorpus(root);
      expect(report.errors.some((e) => e.path.endsWith("bad-extra-field.md"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("flags a tampered inbound source_hash", async () => {
    const root = await tempRepo();
    try {
      const report = await validateCorpus(root);
      expect(
        report.errors.some(
          (e) => e.path.endsWith("2026-09-04-tampered.md") && /source_hash/.test(e.message),
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("flags a crm_id that does not match the directory name", async () => {
    const root = await tempRepo();
    try {
      const oppFile = join(
        root,
        "context/accounts/fix-co/opportunities/006Ax0000GkLmNpQAA/opportunity.md",
      );
      const text = await readFile(oppFile, "utf8");
      await writeFile(
        oppFile,
        text.replace('crm_id: "006Ax0000GkLmNpQAA"', 'crm_id: "006Zz9999ZzZzZzZZZ"'),
      );
      const report = await validateCorpus(root);
      expect(
        report.errors.some(
          (e) => e.path.endsWith("opportunity.md") && /directory name/.test(e.message),
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
