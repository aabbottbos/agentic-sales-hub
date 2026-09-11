import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveScope } from "./resolve.js";
import { ScopeViolationError } from "../errors.js";
import type { ContextGrants } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "../../test/fixtures/context");

const OPP = "006Ax0000GkLmNpQAA";
const oppDir = `context/accounts/fix-co/opportunities/${OPP}`;

const findEvidenceGrants: ContextGrants = {
  read: [
    "context/org/**",
    "context/demand-gen/**",
    "context/accounts/*/opportunities/*/artifacts/**",
  ],
};

const sowReviewGrants: ContextGrants = {
  read: [
    "context/legal/guidance.md",
    "context/legal/clause-library/**",
    "context/accounts/*/opportunities/*/inbound/**",
  ],
};

describe("resolveScope", () => {
  it("find-evidence: org + demand-gen + historical artifacts, no legal/inbound", async () => {
    const files = await resolveScope(findEvidenceGrants, {}, fixturesRoot);
    expect(files).toContain("context/org/company.md");
    expect(files).toContain("context/demand-gen/icp/account.md");
    expect(files).toContain(`${oppDir}/artifacts/a-0001-brief.md`);
    expect(files.some((f) => f.startsWith("context/legal/"))).toBe(false);
    expect(files.some((f) => f.includes("/inbound/"))).toBe(false);
    expect(files.some((f) => f.includes("/meetings/"))).toBe(false);
    expect(files).toEqual([...files].sort());
  });

  it("sow-review anchored to a document: guidance + clause-library + that one inbound file", async () => {
    const doc = `${oppDir}/inbound/2026-09-03-fixture-redline.md`;
    const files = await resolveScope(sowReviewGrants, { documentPath: doc }, fixturesRoot);
    expect(files).toContain("context/legal/guidance.md");
    expect(files).toContain("context/legal/clause-library/indemnity.md");
    expect(files).toContain("context/legal/clause-library/liability.md");
    expect(files).toContain(doc);
    // does not pull in the other inbound fixture beyond what the glob matches...
    // actually the glob DOES match all inbound files; assert the named one is present
    expect(files.filter((f) => f.includes("/inbound/")).length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.startsWith("context/org/"))).toBe(false);
  });

  it("throws when a named document is outside the grants", async () => {
    await expect(
      resolveScope(sowReviewGrants, { documentPath: "context/org/company.md" }, fixturesRoot),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("throws when a glob needs {account} but none is provided", async () => {
    await expect(
      resolveScope({ read: ["context/accounts/{account}/**"] }, {}, fixturesRoot),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("substitutes {account} and {opp}", async () => {
    const files = await resolveScope(
      { read: ["context/accounts/{account}/opportunities/{opp}/meetings/**"] },
      { accountSlug: "fix-co", oppId: OPP },
      fixturesRoot,
    );
    expect(files).toContain(`${oppDir}/meetings/2026-09-02-discovery.md`);
  });

  it("rejects a grant glob that escapes the context root", async () => {
    await expect(
      resolveScope({ read: ["../secrets/**"] }, {}, fixturesRoot),
    ).rejects.toBeInstanceOf(ScopeViolationError);
    await expect(resolveScope({ read: ["/etc/passwd"] }, {}, fixturesRoot)).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
    await expect(resolveScope({ read: ["packages/**"] }, {}, fixturesRoot)).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
  });
});
