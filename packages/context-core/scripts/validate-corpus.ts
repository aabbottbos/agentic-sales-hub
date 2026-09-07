#!/usr/bin/env tsx
/**
 * `pnpm corpus:validate` — walk context/, validate every file against its schema,
 * verify inbound source_hash, cross-check crm_id / account_slug against directory
 * names. Exit non-zero on any error. Runs in CI.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCorpus } from "../src/validate-corpus.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.argv[2] ?? join(here, "../../..");

const report = await validateCorpus(repoRoot);

if (report.errors.length === 0) {
  console.log(`corpus:validate — OK (${report.filesChecked} files, 0 errors)`);
  process.exit(0);
}

console.error(
  `corpus:validate — ${report.errors.length} error(s) across ${report.filesChecked} files:\n`,
);
for (const err of report.errors) {
  console.error(`  ${err.path}\n    ${err.message}\n`);
}
process.exit(1);
