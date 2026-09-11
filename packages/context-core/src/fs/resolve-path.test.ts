import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { resolveContextPath, toLogicalContextPath } from "./resolve-path.js";
import { ScopeViolationError } from "../errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "../../test/fixtures");

describe("resolveContextPath", () => {
  it("strips the context/ prefix and joins onto a context-named fixture root, resolving to a real file", () => {
    const root = join(fixturesRoot, "context");
    const result = resolveContextPath("context/org/company.md", root);
    expect(result).toBe(join(root, "org/company.md"));
    expect(existsSync(result)).toBe(true);
  });

  it("strips the context/ prefix and joins onto an arbitrary non-context-named root", () => {
    const result = resolveContextPath("context/legal/guidance.md", "/tmp/some/arbitrary/demo-root");
    expect(result).toBe("/tmp/some/arbitrary/demo-root/legal/guidance.md");
  });

  it("passes an absolute logicalPath through unchanged, ignoring root entirely", () => {
    const abs = "/already/absolute/context/org/company.md";
    expect(resolveContextPath(abs, "/should/not/matter")).toBe(abs);
    // root need not even be a valid-looking path
    expect(resolveContextPath(abs, "")).toBe(abs);
  });

  it("throws a ScopeViolationError on a relative path that does not start with context/", () => {
    expect(() => resolveContextPath("org/company.md", "/some/root")).toThrow(
      /must start with "context\/"/,
    );
    expect(() => resolveContextPath("legal/guidance.md", "/some/root")).toThrow(
      ScopeViolationError,
    );
  });

  it("normalizes backslashes before processing", () => {
    const result = resolveContextPath("context\\accounts\\meridian-grid\\account.md", "/some/root");
    expect(result).toBe("/some/root/accounts/meridian-grid/account.md");
  });

  it("handles the bare context path with no remainder", () => {
    expect(resolveContextPath("context", "/some/root")).toBe("/some/root");
  });
});

describe("toLogicalContextPath", () => {
  it("converts a physical absolute path under root back to a logical context/... string", () => {
    const result = toLogicalContextPath(
      "/some/physical/root/org/company.md",
      "/some/physical/root",
    );
    expect(result).toBe("context/org/company.md");
  });

  it("posix-normalizes output even given backslash input", () => {
    const result = toLogicalContextPath(
      "/some/root\\accounts\\meridian-grid\\account.md".replaceAll("\\", "/"),
      "/some/root",
    );
    expect(result).toBe("context/accounts/meridian-grid/account.md");
  });

  it("round-trips with resolveContextPath", () => {
    const root = "/tmp/some/arbitrary/demo-root";
    const logical = "context/legal/guidance.md";
    const physical = resolveContextPath(logical, root);
    expect(toLogicalContextPath(physical, root)).toBe(logical);
  });

  it("round-trips against the real context-named fixture root", () => {
    const root = join(fixturesRoot, "context");
    const logical = "context/org/company.md";
    const physical = resolveContextPath(logical, root);
    expect(toLogicalContextPath(physical, root)).toBe(logical);
  });
});
