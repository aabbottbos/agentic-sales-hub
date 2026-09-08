#!/usr/bin/env tsx
/**
 * `pnpm eval:lock` — record the sha256 of every context/ file into
 * evals/golden/corpus.lock.json. Run this when the corpus legitimately changes
 * and the golden labels have been revisited, so a later `pnpm eval` can tell the
 * two apart.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { walkContext } from "@deal-desk/context-core";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const files = await walkContext(repoRoot);
const entries: Record<string, string> = {};
for (const rel of files.sort()) {
  const bytes = await readFile(join(repoRoot, rel));
  entries[rel] = createHash("sha256").update(bytes).digest("hex");
}
const lock = { generated: new Date().toISOString().slice(0, 10), files: entries };
await writeFile(
  join(repoRoot, "evals/golden/corpus.lock.json"),
  JSON.stringify(lock, null, 2) + "\n",
);
console.log(`eval:lock — ${Object.keys(entries).length} files locked`);
