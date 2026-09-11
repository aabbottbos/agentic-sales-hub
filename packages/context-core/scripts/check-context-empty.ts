#!/usr/bin/env tsx
/**
 * `pnpm check:context-empty` — CI guard (blocking). Fails if anything other
 * than schema/, templates/, or .gitkeep appears directly under context/ at
 * the repo root. This is NOT configurable via --root/ASH_CONTEXT_ROOT — it
 * checks the literal context/ directory, not the configured corpus root
 * (which now lives at examples/demo-corpus/ and is covered by
 * corpus:validate/check:no-real-data instead).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkContextEmpty } from "../src/check-context-empty.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const contextDir = join(repoRoot, "context");

const report = await checkContextEmpty(contextDir);

if (report.ok) {
  console.log(`check:context-empty — OK (context/ contains only schema/, templates/, .gitkeep)`);
  process.exit(0);
}

console.error(
  `check:context-empty — ${report.offenders.length} disallowed entr${report.offenders.length === 1 ? "y" : "ies"} under context/:\n`,
);
for (const offender of report.offenders) {
  console.error(`  context/${offender}`);
}
console.error(`\nallowed: schema, templates, .gitkeep`);
process.exit(1);
