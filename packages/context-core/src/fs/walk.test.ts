import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walkContext } from "./walk.js";

describe("walkContext", () => {
  it("returns logical context/... paths regardless of the physical root's name", async () => {
    // A physical root that is NOT named "context" at all — proves the logical
    // "context/" prefix in the output is independent of the root's real name.
    const tmpDir = await mkdtemp(join(tmpdir(), "walk-"));
    try {
      await mkdir(join(tmpDir, "org"), { recursive: true });
      await writeFile(
        join(tmpDir, "org/foo.md"),
        ["---", "title: Foo", "---", "", "body"].join("\n"),
        "utf8",
      );

      const files = await walkContext(tmpDir);

      expect(files).toContain("context/org/foo.md");
      // The physical file lives at `${tmpDir}/org/foo.md` — no "context/" segment
      // anywhere in the real path — yet the returned path is logically prefixed.
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("lists .md files and outcomes.jsonl under exactly the four corpus subdirs, nothing else", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "walk-"));
    try {
      await mkdir(join(tmpDir, "org"), { recursive: true });
      await mkdir(join(tmpDir, "accounts/acme/opportunities/opp1"), { recursive: true });
      await mkdir(join(tmpDir, "schema"), { recursive: true });
      await mkdir(join(tmpDir, "some-other-dir"), { recursive: true });

      await writeFile(join(tmpDir, "org/company.md"), "---\ntitle: X\n---\nbody", "utf8");
      await writeFile(
        join(tmpDir, "accounts/acme/opportunities/opp1/outcomes.jsonl"),
        '{"date":"2026-01-01"}\n',
        "utf8",
      );
      await writeFile(join(tmpDir, "schema/org-company.json"), "{}", "utf8");
      await writeFile(join(tmpDir, "some-other-dir/stray.md"), "stray", "utf8");

      const files = await walkContext(tmpDir);

      expect(files).toContain("context/org/company.md");
      expect(files).toContain("context/accounts/acme/opportunities/opp1/outcomes.jsonl");
      expect(files.some((f) => f.includes("schema"))).toBe(false);
      expect(files.some((f) => f.includes("some-other-dir"))).toBe(false);
      expect(files).toEqual([...files].sort());
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns an empty array for a root with none of the four corpus subdirs", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "walk-"));
    try {
      const files = await walkContext(tmpDir);
      expect(files).toEqual([]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
