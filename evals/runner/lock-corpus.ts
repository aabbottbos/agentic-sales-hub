#!/usr/bin/env tsx
/**
 * `pnpm eval:lock` — record the sha256 of every context file into
 * evals/golden/corpus.lock.json. Run this when the corpus legitimately changes
 * and the golden labels have been revisited, so a later `pnpm eval` can tell the
 * two apart.
 *
 * The corpus root defaults to `examples/demo-corpus`; override with
 * `--root <path>` or `ASH_CONTEXT_ROOT`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  walkContext,
  resolveContextRoot,
  resolveContextPath,
} from "@agentic-sales-hub/context-core";

function parseRootFlag(argv: string[]): string | undefined {
  const eq = argv.find((a) => a.startsWith("--root="));
  if (eq) return eq.slice("--root=".length);
  const idx = argv.indexOf("--root");
  if (idx !== -1 && argv[idx + 1] !== undefined) return argv[idx + 1];
  return undefined;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rootFlag = parseRootFlag(process.argv.slice(2));
const root = resolveContextRoot({
  root: rootFlag ?? process.env.ASH_CONTEXT_ROOT ?? "examples/demo-corpus",
  cwd: repoRoot,
});

const files = await walkContext(root);
const entries: Record<string, string> = {};
for (const rel of files.sort()) {
  const bytes = await readFile(resolveContextPath(rel, root));
  entries[rel] = createHash("sha256").update(bytes).digest("hex");
}
const lock = { generated: new Date().toISOString().slice(0, 10), files: entries };
await writeFile(
  join(repoRoot, "evals/golden/corpus.lock.json"),
  JSON.stringify(lock, null, 2) + "\n",
);
console.log(`eval:lock — ${Object.keys(entries).length} files locked (root: ${root})`);
