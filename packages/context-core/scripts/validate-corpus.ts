#!/usr/bin/env tsx
/**
 * `pnpm corpus:validate` — walk the configured corpus root (defaults to
 * `examples/demo-corpus`; override with `--root <path>` or `ASH_CONTEXT_ROOT`),
 * validate every file against its schema, verify inbound source_hash,
 * cross-check crm_id / account_slug against directory names. Exit non-zero
 * on any error. Runs in CI.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateCorpus } from "../src/validate-corpus.js";
import { resolveContextRoot } from "../src/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

function parseRootFlag(argv: string[]): string | undefined {
  const eq = argv.find((a) => a.startsWith("--root="));
  if (eq) return eq.slice("--root=".length);
  const idx = argv.indexOf("--root");
  if (idx !== -1 && argv[idx + 1] !== undefined) return argv[idx + 1];
  return undefined;
}

const rootFlag = parseRootFlag(process.argv.slice(2));
const positionalArg = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];

const root = resolveContextRoot({
  root: rootFlag ?? positionalArg ?? process.env.ASH_CONTEXT_ROOT ?? "examples/demo-corpus",
  cwd: repoRoot,
});

const report = await validateCorpus(repoRoot, root);

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
