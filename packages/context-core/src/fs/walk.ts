import { glob } from "tinyglobby";

const CORPUS_SUBDIRS = ["org", "demand-gen", "legal", "accounts"] as const;

/**
 * List every context file under `root` (the physical corpus root), as
 * LOGICAL `context/...`-prefixed posix paths. Includes `.md` files and
 * `outcomes.jsonl` under exactly the four corpus subdirs (`org`, `demand-gen`,
 * `legal`, `accounts`) — explicit enumeration, not a schema-dir exclusion, so
 * the schema dir (and anything else at `root`) is never walked in the first
 * place.
 *
 * `root` is the physical corpus root; returned paths are logical, prefixed
 * with `context/` regardless of what `root` is named on disk (e.g.
 * `context/org/company.md`).
 */
export async function walkContext(root: string): Promise<string[]> {
  const patterns = CORPUS_SUBDIRS.flatMap((dir) => [`${dir}/**/*.md`, `${dir}/**/outcomes.jsonl`]);
  const matches = await glob(patterns, { cwd: root, onlyFiles: true, dot: false });
  return matches.map((m) => `context/${m.replaceAll("\\", "/")}`).sort();
}
