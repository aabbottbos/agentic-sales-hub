import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backfillActor } from "./backfill-actor.js";

const OPP_DIR = "accounts/fix-co/opportunities/006Ax0000GkLmNpQAA";

const BRIEF_MISSING_ACTOR = `---
fictional: true
mutability: accumulating
schema_version: "1.0.0"
created: "2026-08-04T00:00:00Z"
title: Call-prep brief — fixture
artifact_id: a-0001
kind: brief
generated_by: call-prep
superseded: false
citations:
  - claim: A claim.
    path: context/org/company.md
    span: [0, 10]
---

# Body

Some body text.
`;

const PROPOSAL_MISSING_ACTOR = `---
fictional: true
mutability: accumulating
schema_version: "1.0.0"
created: "2026-08-20T00:00:00Z"
title: Proposal draft — fixture
artifact_id: a-0002
kind: proposal
generated_by: proposal-draft
superseded: true
citations: []
---

# Proposal body
`;

const OUTCOMES_MISSING_ACTOR = [
  `{"date": "2026-08-20", "artifact": "context/accounts/fix-co/opportunities/006Ax0000GkLmNpQAA/artifacts/a-0002-proposal.md", "outcome": "sent", "note": "Sent for review."}`,
  `{"date": "2026-08-28", "artifact": "context/accounts/fix-co/opportunities/006Ax0000GkLmNpQAA/artifacts/a-0002-proposal.md", "outcome": "superseded"}`,
  "",
].join("\n");

/** Builds a scratch corpus at <tmp>/context/accounts/... with a brief, a
 * proposal, and an outcomes.jsonl, all missing `actor`. */
async function tempCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "backfill-actor-"));
  const root = join(tmpDir, "context");
  const artifactsDir = join(root, OPP_DIR, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, "a-0001-brief.md"), BRIEF_MISSING_ACTOR, "utf8");
  await writeFile(join(artifactsDir, "a-0002-proposal.md"), PROPOSAL_MISSING_ACTOR, "utf8");
  await writeFile(join(root, OPP_DIR, "outcomes.jsonl"), OUTCOMES_MISSING_ACTOR, "utf8");
  return { tmpDir, root };
}

describe("backfillActor", () => {
  it("injects actor + bumps schema_version into artifacts missing it", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const report = await backfillActor(root);

      expect(report.filesChecked).toBe(3);
      expect(report.filesModified).toBe(3);
      expect(report.modifiedPaths.sort()).toEqual(
        [
          `context/${OPP_DIR}/artifacts/a-0001-brief.md`,
          `context/${OPP_DIR}/artifacts/a-0002-proposal.md`,
          `context/${OPP_DIR}/outcomes.jsonl`,
        ].sort(),
      );

      const brief = await readFile(join(root, OPP_DIR, "artifacts/a-0001-brief.md"), "utf8");
      expect(brief).toMatch(/actor:\n\s+type: system\n\s+id: legacy/);
      expect(brief).toMatch(/schema_version: "1\.1\.0"/);
      // superseded/citations untouched, positioned before/around actor sanely
      expect(brief).toContain("superseded: false");
      expect(brief).toContain("citations:");
      expect(brief).toContain("Some body text.");

      const proposal = await readFile(join(root, OPP_DIR, "artifacts/a-0002-proposal.md"), "utf8");
      expect(proposal).toMatch(/actor:\n\s+type: system\n\s+id: legacy/);
      expect(proposal).toMatch(/schema_version: "1\.1\.0"/);
      expect(proposal).toContain("superseded: true");

      const outcomes = await readFile(join(root, OPP_DIR, "outcomes.jsonl"), "utf8");
      const lines = outcomes.split("\n").filter((l) => l.trim());
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        const obj = JSON.parse(line);
        expect(obj.actor).toEqual({ type: "system", id: "legacy" });
        // key order: date, artifact, outcome, actor, (note)
        expect(Object.keys(obj).slice(0, 4)).toEqual(["date", "artifact", "outcome", "actor"]);
      }
      const first = JSON.parse(lines[0]!);
      expect(first.note).toBe("Sent for review.");
      const second = JSON.parse(lines[1]!);
      expect(second.note).toBeUndefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("is idempotent — a second run makes no further changes", async () => {
    const { tmpDir, root } = await tempCorpus();
    try {
      const first = await backfillActor(root);
      expect(first.filesModified).toBe(3);

      const briefAfterFirst = await readFile(
        join(root, OPP_DIR, "artifacts/a-0001-brief.md"),
        "utf8",
      );
      const outcomesAfterFirst = await readFile(join(root, OPP_DIR, "outcomes.jsonl"), "utf8");

      const second = await backfillActor(root);
      expect(second.filesChecked).toBe(3);
      expect(second.filesModified).toBe(0);
      expect(second.modifiedPaths).toEqual([]);

      const briefAfterSecond = await readFile(
        join(root, OPP_DIR, "artifacts/a-0001-brief.md"),
        "utf8",
      );
      const outcomesAfterSecond = await readFile(join(root, OPP_DIR, "outcomes.jsonl"), "utf8");

      expect(briefAfterSecond).toBe(briefAfterFirst);
      expect(outcomesAfterSecond).toBe(outcomesAfterFirst);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("is a no-op on records that already have actor", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "backfill-actor-clean-"));
    try {
      const root = join(tmpDir, "context");
      const artifactsDir = join(root, OPP_DIR, "artifacts");
      await mkdir(artifactsDir, { recursive: true });
      const alreadyMigrated = BRIEF_MISSING_ACTOR.replace(
        "superseded: false\n",
        "superseded: false\nactor:\n  type: human\n  id: aabbott\n",
      ).replace('schema_version: "1.0.0"', 'schema_version: "1.1.0"');
      await writeFile(join(artifactsDir, "a-0001-brief.md"), alreadyMigrated, "utf8");
      await writeFile(
        join(root, OPP_DIR, "outcomes.jsonl"),
        `{"date": "2026-08-20", "artifact": "a.md", "outcome": "sent", "actor": {"type": "human", "id": "aabbott"}, "note": "hi"}\n`,
        "utf8",
      );

      const report = await backfillActor(root);
      expect(report.filesChecked).toBe(2);
      expect(report.filesModified).toBe(0);
      expect(report.modifiedPaths).toEqual([]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
