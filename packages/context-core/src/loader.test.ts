import { describe, expect, it } from "vitest";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLoader } from "./loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

describe("createLoader — empty context tree", () => {
  it("an empty context/ with no override is a valid state: list() and readScope() return [], never throw", async () => {
    // A temp repo root that has ONLY a schema/ dir (copied from the real
    // context/schema) — no org/, demand-gen/, legal/, or accounts/ at all,
    // not even empty ones.
    const tmpRepoRoot = await mkdtemp(join(tmpdir(), "loader-empty-"));
    try {
      await cp(join(repoRoot, "context/schema"), join(tmpRepoRoot, "context/schema"), {
        recursive: true,
      });
      const tmpContextRoot = join(tmpRepoRoot, "context");

      const loader = await createLoader({ repoRoot: tmpRepoRoot, root: tmpContextRoot });

      await expect(loader.list()).resolves.toEqual([]);
      await expect(loader.readScope({ read: ["context/org/**"] }, {})).resolves.toEqual([]);
    } finally {
      await rm(tmpRepoRoot, { recursive: true, force: true });
    }
  });
});
