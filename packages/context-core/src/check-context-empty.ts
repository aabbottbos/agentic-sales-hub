import { readdir } from "node:fs/promises";

export interface CheckContextEmptyReport {
  ok: boolean;
  offenders: string[];
}

/** Top-level entries that are allowed to exist directly under `context/`. */
const ALLOWED_TOP_LEVEL = new Set(["schema", "templates", ".gitkeep"]);

/**
 * Check that `context/` (the literal repo-root directory, post tenancy-seam
 * move) contains nothing beyond the allowlist `{schema, templates, .gitkeep}`
 * at its top level.
 *
 * This is a SHALLOW, one-level check: it reads only the immediate children
 * of `contextDir` (a single `readdir`, no recursion) and does not look
 * inside `schema/` or `templates/` at all — their contents are unconstrained
 * by this guard. "Offenders" are the names of any top-level entries (files
 * or directories) not in the allowlist.
 *
 * This protects against `context/` silently regaining content after the
 * corpus moved to `examples/demo-corpus/` — e.g. a stray file dropped at the
 * top level, or one of the moved account/org/legal/demand-gen directories
 * reappearing (accidentally recreated, a bad merge, a script that still
 * writes to the old path) — none of which would be caught by
 * `corpus:validate` or `check:no-real-data`, which both operate on the
 * *configured* corpus root (now `examples/demo-corpus/`), not the literal
 * `context/` directory.
 *
 * If `contextDir` itself does not exist, this lets the `readdir` rejection
 * propagate (this function does not catch it). There's no existing
 * precedent in this package for a missing directory being a distinct "ok"
 * or "error" state — `validateCorpus` walks via `loader.list()`, which
 * assumes the root exists — so a thrown ENOENT here matches Node's natural
 * behavior and surfaces loudly in CI rather than silently reporting `ok`.
 */
export async function checkContextEmpty(contextDir: string): Promise<CheckContextEmptyReport> {
  const entries = await readdir(contextDir, { withFileTypes: true });
  const offenders = entries.filter((e) => !ALLOWED_TOP_LEVEL.has(e.name)).map((e) => e.name);
  return { ok: offenders.length === 0, offenders };
}
