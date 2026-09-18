import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLoader } from "../loader.js";
import type { ArtifactCitationInput } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const schemaDir = join(repoRoot, "context/schema");
const fixturesRoot = join(here, "../../test/fixtures");

const ACCOUNT = "fix-co";
const OPP = "006Ax0000GkLmNpQAA";

const citation: ArtifactCitationInput = {
  claim: "Services scope is a common concern.",
  path: "context/org/company.md",
  span: [0, 20],
};

/** Same tempCorpus() pattern as write-path.test.ts / write-findings.test.ts. */
async function tempCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "oq-int-"));
  await cp(fixturesRoot, tmpDir, { recursive: true });
  return { tmpDir, root: join(tmpDir, "context") };
}

/**
 * Integration proof for spec 005 OQ#5: the per-opportunity queue wired into
 * loader.writeArtifact/appendOutcome actually serializes concurrent writers
 * against the SAME opportunity, closing the gap where appendOutcome had no
 * write-guard of its own.
 */
describe("loader writeArtifact/appendOutcome — per-opportunity queue integration (OQ#5)", () => {
  it("N concurrent writeArtifact calls mint N distinct sequential artifact ids with no gaps/dupes", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const loader = await createLoader({
        repoRoot: tmpDir,
        root,
        schemaDir,
        now: () => new Date("2026-09-18T12:00:00Z"),
      });

      const N = 15;
      // The fixture corpus already has a-0001-brief.md, so N new writes must
      // land as a-0002 .. a-0016 — sequential, no gaps, no dupes.
      const actors = Array.from({ length: N }, (_, i) => ({
        type: "system" as const,
        id: `writer-${i}`,
      }));

      const results = await Promise.all(
        actors.map((actor, i) =>
          loader.writeArtifact({
            accountSlug: ACCOUNT,
            crmId: OPP,
            kind: "brief",
            generatedBy: "call-prep",
            title: `Concurrent brief ${i}`,
            body: `Body ${i}.`,
            citations: [citation],
            actor,
          }),
        ),
      );

      // 1. Exactly N distinct, sequential artifact ids, no gaps/dupes.
      const ids = results.map((r) => r.artifactId).sort();
      const expectedIds = Array.from(
        { length: N },
        (_, i) => `a-${String(i + 2).padStart(4, "0")}`,
      );
      expect(ids).toEqual(expectedIds);
      expect(new Set(ids).size).toBe(N);

      // Filesystem agrees: exactly N+1 artifact files total (the pre-existing
      // a-0001 plus the N new ones), each id appearing exactly once.
      const artifactsDir = join(root, "accounts", ACCOUNT, "opportunities", OPP, "artifacts");
      const files = (await readdir(artifactsDir)).sort();
      expect(files).toHaveLength(N + 1);
      const fileIds = files
        .map((f) => /^(a-\d{4,})-/.exec(f)?.[1])
        .filter(Boolean)
        .sort();
      expect(new Set(fileIds).size).toBe(N + 1);

      // 2. outcomes.jsonl: each writeArtifact auto-opens exactly one "unused"
      // outcome via the internal raw appendOutcome call -> exactly N lines
      // (no pre-existing outcomes.jsonl in the fixture).
      const outcomesPath = join(root, "accounts", ACCOUNT, "opportunities", OPP, "outcomes.jsonl");
      const text = await readFile(outcomesPath, "utf8");
      const lines = text.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(N);

      const records = lines.map(
        (l) => JSON.parse(l) as { actor: { id: string }; outcome: string; artifact: string },
      );
      for (const r of records) {
        expect(r.outcome).toBe("unused");
      }

      // 3. Every supplied actor.id appears exactly once, confirming each
      // call's write genuinely landed (not just "N writes happened").
      const actorIds = records.map((r) => r.actor.id).sort();
      const expectedActorIds = actors.map((a) => a.id).sort();
      expect(actorIds).toEqual(expectedActorIds);

      // And each outcome's artifact path matches one of the minted artifacts,
      // 1:1, with no duplicate artifact references.
      const outcomeArtifacts = records.map((r) => r.artifact).sort();
      const resultArtifactPaths = results.map((r) => r.artifactPath).sort();
      expect(outcomeArtifacts).toEqual(resultArtifactPaths);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("interleaved writeArtifact + explicit appendOutcome calls against one opportunity produce exactly N+M outcome lines, all valid", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const loader = await createLoader({
        repoRoot: tmpDir,
        root,
        schemaDir,
        now: () => new Date("2026-09-18T12:00:00Z"),
      });

      const N = 10; // writeArtifact calls (each auto-opens 1 outcome)
      const M = 5; // explicit appendOutcome calls against the pre-existing a-0001 artifact

      const writeActors = Array.from({ length: N }, (_, i) => ({
        type: "system" as const,
        id: `writer-${i}`,
      }));
      const outcomeActors = Array.from({ length: M }, (_, i) => ({
        type: "human" as const,
        id: `reviewer-${i}`,
      }));

      const existingArtifact = `context/accounts/${ACCOUNT}/opportunities/${OPP}/artifacts/a-0001-brief.md`;

      const writeCalls = writeActors.map((actor, i) =>
        loader.writeArtifact({
          accountSlug: ACCOUNT,
          crmId: OPP,
          kind: "brief",
          generatedBy: "call-prep",
          title: `Mixed concurrent brief ${i}`,
          body: `Body ${i}.`,
          citations: [citation],
          actor,
        }),
      );
      const outcomeCalls = outcomeActors.map((actor) =>
        loader.appendOutcome({
          accountSlug: ACCOUNT,
          crmId: OPP,
          artifact: existingArtifact,
          outcome: "sent",
          date: "2026-09-18",
          actor,
        }),
      );

      const allResults = await Promise.all([...writeCalls, ...outcomeCalls]);

      // All N writeArtifact calls succeeded with distinct ids.
      const writeResults = allResults.slice(0, N) as {
        artifactId: string;
        artifactPath: string;
      }[];
      const ids = writeResults.map((r) => r.artifactId);
      expect(new Set(ids).size).toBe(N);

      const outcomesPath = join(root, "accounts", ACCOUNT, "opportunities", OPP, "outcomes.jsonl");
      const text = await readFile(outcomesPath, "utf8");
      const lines = text.trim().split("\n").filter(Boolean);

      // Exactly N (auto-opened "unused") + M (explicit "sent") = N+M valid JSON lines.
      expect(lines).toHaveLength(N + M);
      const records = lines.map((l) => JSON.parse(l) as { actor: { id: string }; outcome: string });
      for (const l of lines) {
        expect(() => JSON.parse(l)).not.toThrow();
      }

      const unusedCount = records.filter((r) => r.outcome === "unused").length;
      const sentCount = records.filter((r) => r.outcome === "sent").length;
      expect(unusedCount).toBe(N);
      expect(sentCount).toBe(M);

      // Every actor id supplied across BOTH sets of calls appears exactly once.
      const allExpectedActorIds = [...writeActors, ...outcomeActors].map((a) => a.id).sort();
      const actualActorIds = records.map((r) => r.actor.id).sort();
      expect(actualActorIds).toEqual(allExpectedActorIds);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
