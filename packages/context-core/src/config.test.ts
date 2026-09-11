import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { resolveContextRoot } from "./config.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "config-"));
}

describe("resolveContextRoot", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await tempDir();
    delete process.env.ASH_CONTEXT_ROOT;
  });

  afterEach(async () => {
    delete process.env.ASH_CONTEXT_ROOT;
    await rm(dir, { recursive: true, force: true });
  });

  it("opts.root wins even when ASH_CONTEXT_ROOT and ash.config.json both also set a different value", async () => {
    process.env.ASH_CONTEXT_ROOT = "/env-root";
    await writeFile(join(dir, "ash.config.json"), JSON.stringify({ contextRoot: "./config-root" }));

    const result = resolveContextRoot({ root: "./opts-root", cwd: dir });

    expect(result).toBe(join(dir, "opts-root"));
  });

  it("ASH_CONTEXT_ROOT wins over ash.config.json when opts.root is not passed", async () => {
    process.env.ASH_CONTEXT_ROOT = "./env-root";
    await writeFile(join(dir, "ash.config.json"), JSON.stringify({ contextRoot: "./config-root" }));

    const result = resolveContextRoot({ cwd: dir });

    expect(result).toBe(join(dir, "env-root"));
  });

  it("ash.config.json wins over the ./context default when opts.root and ASH_CONTEXT_ROOT are absent", async () => {
    await writeFile(join(dir, "ash.config.json"), JSON.stringify({ contextRoot: "./config-root" }));

    const result = resolveContextRoot({ cwd: dir });

    expect(result).toBe(join(dir, "config-root"));
  });

  it("falls through to ./context when nothing else is set", () => {
    const result = resolveContextRoot({ cwd: dir });

    expect(result).toBe(join(dir, "context"));
  });

  it("resolveContextRoot() with no args at all does not throw and returns an absolute path", () => {
    const result = resolveContextRoot();

    expect(isAbsolute(result)).toBe(true);
  });

  describe("absolute-path guarantee", () => {
    it("is absolute when opts.root is relative", () => {
      const result = resolveContextRoot({ root: "./relative-root", cwd: dir });
      expect(isAbsolute(result)).toBe(true);
    });

    it("is absolute (and passed through) when opts.root is already absolute", () => {
      const abs = join(dir, "already-absolute");
      const result = resolveContextRoot({ root: abs, cwd: dir });
      expect(result).toBe(abs);
      expect(isAbsolute(result)).toBe(true);
    });

    it("is absolute when ASH_CONTEXT_ROOT is relative", () => {
      process.env.ASH_CONTEXT_ROOT = "./env-relative";
      const result = resolveContextRoot({ cwd: dir });
      expect(isAbsolute(result)).toBe(true);
    });

    it("is absolute when ash.config.json's contextRoot is relative", async () => {
      await writeFile(
        join(dir, "ash.config.json"),
        JSON.stringify({ contextRoot: "./cfg-relative" }),
      );
      const result = resolveContextRoot({ cwd: dir });
      expect(isAbsolute(result)).toBe(true);
    });

    it("is absolute for the ./context default", () => {
      const result = resolveContextRoot({ cwd: dir });
      expect(isAbsolute(result)).toBe(true);
    });
  });

  describe("fallthrough behavior", () => {
    it("does not throw and falls through to ./context when ash.config.json is missing", () => {
      expect(() => resolveContextRoot({ cwd: dir })).not.toThrow();
      expect(resolveContextRoot({ cwd: dir })).toBe(join(dir, "context"));
    });

    it("does not throw and falls through to ./context when ash.config.json is malformed JSON", async () => {
      await writeFile(join(dir, "ash.config.json"), "{ not valid json ,,, ");

      expect(() => resolveContextRoot({ cwd: dir })).not.toThrow();
      expect(resolveContextRoot({ cwd: dir })).toBe(join(dir, "context"));
    });

    it("falls through to ./context when ash.config.json has no contextRoot field", async () => {
      await writeFile(join(dir, "ash.config.json"), JSON.stringify({ org: { slug: "meridian" } }));

      expect(resolveContextRoot({ cwd: dir })).toBe(join(dir, "context"));
    });

    it("falls through to ./context when ash.config.json's contextRoot is not a string", async () => {
      await writeFile(join(dir, "ash.config.json"), JSON.stringify({ contextRoot: 42 }));

      expect(resolveContextRoot({ cwd: dir })).toBe(join(dir, "context"));
    });

    it("falls through to ./context when ash.config.json is valid JSON but not an object (e.g. an array)", async () => {
      await writeFile(join(dir, "ash.config.json"), JSON.stringify([1, 2, 3]));

      expect(resolveContextRoot({ cwd: dir })).toBe(join(dir, "context"));
    });
  });

  it("defaults cwd to process.cwd() when omitted", () => {
    process.env.ASH_CONTEXT_ROOT = "./relative-from-process-cwd";
    const result = resolveContextRoot();
    expect(result).toBe(join(process.cwd(), "relative-from-process-cwd"));
  });
});
