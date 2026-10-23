import { describe, expect, it } from "vitest";
import { latestResultFile } from "./compare.js";

describe("latestResultFile", () => {
  const never = () => {
    throw new Error("addedAt should not be called");
  };

  it("picks the latest date without consulting addedAt when it is unique", () => {
    expect(
      latestResultFile(["2026-09-10-aaa.json", "2026-09-11-bbb.json", "README.md"], never),
    ).toBe("2026-09-11-bbb.json");
  });

  it("breaks a same-date tie by commit time, not by sha spelling", () => {
    // f82c7a7 sorts after 59e5e45 lexically but was committed first.
    const added: Record<string, number> = {
      "2026-09-11-f82c7a7.json": 100,
      "2026-09-11-59e5e45.json": 200,
    };
    expect(
      latestResultFile(
        ["2026-09-10-0932036.json", "2026-09-11-f82c7a7.json", "2026-09-11-59e5e45.json"],
        (f) => added[f]!,
      ),
    ).toBe("2026-09-11-59e5e45.json");
  });

  it("treats an uncommitted (Infinity) same-date file as newest", () => {
    expect(
      latestResultFile(["2026-10-23-bd991b6.json", "2026-10-23-6b82567.json"], (f) =>
        f.includes("6b82567") ? Number.POSITIVE_INFINITY : 100,
      ),
    ).toBe("2026-10-23-6b82567.json");
  });

  it("returns undefined when there are no result files", () => {
    expect(latestResultFile([".gitkeep"], never)).toBeUndefined();
  });
});
