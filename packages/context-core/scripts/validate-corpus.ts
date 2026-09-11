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
// The positional arg is a legacy fallback (nothing in-repo calls it this way
// today). Its MEANING changed with the tenancy seam: it used to be the repo
// root; it's now the corpus root, same as --root. A stale caller passing a
// repo root positionally will silently validate whatever `context/` (now
// near-empty) resolves to instead — a 0-file "OK", not an error. Prefer
// --root or ASH_CONTEXT_ROOT explicitly.
const positionalArg = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];

const root = resolveContextRoot({
  root: rootFlag ?? positionalArg ?? process.env.ASH_CONTEXT_ROOT ?? "examples/demo-corpus",
  cwd: repoRoot,
});

const report = await validateCorpus(repoRoot, root);

if (report.errors.length === 0) {
  if (report.filesChecked === 0) {
    // A genuinely empty context/ (no override configured) is a valid state
    // per design — this is not an error — but 0 files is easy to mistake
    // for "28 files, all valid" in CI output. Flag it distinctly so a wrong
    // --root / stale positional arg doesn't read as a clean pass.
    console.log(`corpus:validate — OK, but 0 files checked at root "${root}"`);
    process.exit(0);
  }
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
