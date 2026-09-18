import { readFile, writeFile } from "node:fs/promises";
import { glob } from "tinyglobby";
import { resolveContextPath } from "./fs/resolve-path.js";
import { parseFrontmatter } from "./frontmatter/parse.js";
import { SCHEMA_VERSION } from "./schema/registry.js";

const LEGACY_ACTOR = { type: "system", id: "legacy" } as const;

export interface BackfillReport {
  filesChecked: number;
  filesModified: number;
  modifiedPaths: string[];
}

/**
 * One-time migration: inject `actor: {type:"system", id:"legacy"}` into any
 * artifact `.md` frontmatter or `outcomes.jsonl` line that is missing it, and
 * bump that record's `schema_version` to the current `SCHEMA_VERSION` (it is
 * being rewritten to now conform). Idempotent — a record that already has
 * `actor` is left untouched (byte-for-byte), so a second run reports
 * `filesModified: 0`.
 *
 * Scoped narrowly to `accounts/​**​/opportunities/​**​/artifacts/*.md` and
 * sibling `outcomes.jsonl` files — the two record shapes Task 1's schema
 * change actually added `actor` to. Not a general corpus walk (that's
 * `validateCorpus`'s job); this only needs to find, parse, patch, and
 * rewrite these two file shapes.
 *
 * `root` is the physical corpus root (e.g. `examples/demo-corpus`), same
 * convention as `validateCorpus`/`writeArtifact`.
 */
export async function backfillActor(root: string): Promise<BackfillReport> {
  const artifactPaths = await glob("accounts/**/opportunities/**/artifacts/*.md", {
    cwd: root,
    onlyFiles: true,
  });
  const outcomePaths = await glob("accounts/**/opportunities/**/outcomes.jsonl", {
    cwd: root,
    onlyFiles: true,
  });

  const report: BackfillReport = { filesChecked: 0, filesModified: 0, modifiedPaths: [] };

  for (const rel of artifactPaths.sort()) {
    report.filesChecked++;
    const logical = `context/${rel.replaceAll("\\", "/")}`;
    const absPath = resolveContextPath(logical, root);
    const original = await readFile(absPath, "utf8");
    const updated = backfillArtifactFrontmatter(original);
    if (updated !== null) {
      await writeFile(absPath, updated, "utf8");
      report.filesModified++;
      report.modifiedPaths.push(logical);
    }
  }

  for (const rel of outcomePaths.sort()) {
    report.filesChecked++;
    const logical = `context/${rel.replaceAll("\\", "/")}`;
    const absPath = resolveContextPath(logical, root);
    const original = await readFile(absPath, "utf8");
    const updated = backfillOutcomesJsonl(original);
    if (updated !== null) {
      await writeFile(absPath, updated, "utf8");
      report.filesModified++;
      report.modifiedPaths.push(logical);
    }
  }

  return report;
}

/**
 * Returns the rewritten file text if `actor` was missing (and injects it, plus
 * bumps `schema_version`), or `null` if the frontmatter already has `actor`
 * (no-op — idempotency).
 *
 * String-level surgery on the existing frontmatter block, not a full
 * YAML-parse-and-re-serialize round trip: this avoids reformatting/reordering
 * fields the migration has no business touching, keeping the diff small and
 * reviewable. `parseFrontmatter` (gray-matter) is used only to *detect*
 * whether `actor` is already present and to read the current
 * `schema_version` line to replace.
 */
function backfillArtifactFrontmatter(text: string): string | null {
  const { data } = parseFrontmatter(text);
  if (data.actor !== undefined) return null; // already migrated

  const lines = text.split("\n");
  const supersededIdx = lines.findIndex((l) => /^superseded:\s*(true|false)\s*$/.test(l));
  if (supersededIdx === -1) {
    throw new Error("could not locate 'superseded:' line to anchor actor insertion");
  }

  const actorLines = ["actor:", `  type: ${LEGACY_ACTOR.type}`, `  id: ${LEGACY_ACTOR.id}`];
  lines.splice(supersededIdx + 1, 0, ...actorLines);

  const schemaVersionIdx = lines.findIndex((l) => /^schema_version:\s*"[^"]*"\s*$/.test(l));
  if (schemaVersionIdx !== -1) {
    lines[schemaVersionIdx] = `schema_version: "${SCHEMA_VERSION}"`;
  }

  return lines.join("\n");
}

/**
 * Returns the rewritten JSONL text if any line was missing `actor` (injects
 * it after `outcome`, before `note` if present), or `null` if every line
 * already has `actor` (idempotency). `outcome.json` has no `schema_version`
 * field, so there is nothing to bump here beyond `actor` itself.
 */
function backfillOutcomesJsonl(text: string): string | null {
  const hadTrailingNewline = text.endsWith("\n");
  const lines = text.split("\n");
  let changed = false;

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (obj.actor !== undefined) return line; // already migrated

    changed = true;
    const { date, artifact, outcome, note, ...rest } = obj;
    const reordered: Record<string, unknown> = { date, artifact, outcome, actor: LEGACY_ACTOR };
    if (note !== undefined) reordered.note = note;
    for (const [k, v] of Object.entries(rest)) {
      reordered[k] = v;
    }
    return JSON.stringify(reordered);
  });

  if (!changed) return null;

  let result = newLines.join("\n");
  if (hadTrailingNewline && !result.endsWith("\n")) result += "\n";
  return result;
}
