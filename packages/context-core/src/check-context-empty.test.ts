import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContextEmpty } from "./check-context-empty.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cce-"));
}

describe("checkContextEmpty", () => {
  it("passes when context/ contains exactly schema/, templates/, .gitkeep", async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, "schema"));
      await mkdir(join(dir, "templates"));
      await writeFile(join(dir, ".gitkeep"), "");

      const report = await checkContextEmpty(dir);
      expect(report).toEqual({ ok: true, offenders: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes when only a subset of the allowlist is present", async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, ".gitkeep"), "");

      const report = await checkContextEmpty(dir);
      expect(report).toEqual({ ok: true, offenders: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes on a genuinely empty directory", async () => {
    const dir = await tempDir();
    try {
      const report = await checkContextEmpty(dir);
      expect(report).toEqual({ ok: true, offenders: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when a stray directory is planted at the top level", async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, "schema"));
      await mkdir(join(dir, "templates"));
      await writeFile(join(dir, ".gitkeep"), "");
      await mkdir(join(dir, "org"));

      const report = await checkContextEmpty(dir);
      expect(report.ok).toBe(false);
      expect(report.offenders).toEqual(["org"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails with the correct offender name when a stray file is planted", async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, "schema"));
      await writeFile(join(dir, ".gitkeep"), "");
      await writeFile(join(dir, "foo.txt"), "stray");

      const report = await checkContextEmpty(dir);
      expect(report.ok).toBe(false);
      expect(report.offenders).toEqual(["foo.txt"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists multiple offenders when several disallowed entries exist", async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, ".gitkeep"), "");
      await mkdir(join(dir, "org"));
      await mkdir(join(dir, "accounts"));
      await writeFile(join(dir, "notes.md"), "stray notes");

      const report = await checkContextEmpty(dir);
      expect(report.ok).toBe(false);
      expect(report.offenders.sort()).toEqual(["accounts", "notes.md", "org"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not recurse into schema/ — a stray file inside it is not flagged", async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, "schema"));
      await writeFile(join(dir, "schema", "not-allowed.json"), "{}");
      await mkdir(join(dir, "templates"));
      await writeFile(join(dir, ".gitkeep"), "");

      const report = await checkContextEmpty(dir);
      expect(report).toEqual({ ok: true, offenders: [] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
