#!/usr/bin/env tsx
/**
 * `evals` wrapper around context-core's corpus validation, so CI can call it
 * through the evals runner alongside no-real-data.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCorpus } from "@deal-desk/context-core";

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const report = await validateCorpus(repoRoot());
if (report.errors.length === 0) {
  console.log(`corpus-schema — OK (${report.filesChecked} files, 0 errors)`);
  process.exit(0);
}
console.error(`corpus-schema — ${report.errors.length} error(s):\n`);
for (const e of report.errors) console.error(`  ${e.path}\n    ${e.message}`);
process.exit(1);
