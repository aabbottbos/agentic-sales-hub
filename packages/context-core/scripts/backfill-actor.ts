#!/usr/bin/env tsx
/**
 * `pnpm corpus:backfill-actor` — walk the configured corpus root (defaults
 * to `examples/demo-corpus`; override with `--root <path>` or
 * `ASH_CONTEXT_ROOT`) and inject `actor: {type:"system", id:"legacy"}` into
 * any artifact/outcome record missing it (Task 1's schema change made
 * `actor` required). Idempotent — safe to re-run; a clean corpus reports
 * 0 files modified.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { backfillActor } from "../src/backfill-actor.js";
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

const root = resolveContextRoot({
  root: rootFlag ?? process.env.ASH_CONTEXT_ROOT ?? "examples/demo-corpus",
  cwd: repoRoot,
});

const report = await backfillActor(root);

if (report.filesModified === 0) {
  console.log(
    `corpus:backfill-actor — already up to date (${report.filesChecked} files checked, 0 modified) at root "${root}"`,
  );
  process.exit(0);
}

console.log(
  `corpus:backfill-actor — modified ${report.filesModified} of ${report.filesChecked} file(s) at root "${root}":`,
);
for (const p of report.modifiedPaths) {
  console.log(`  ${p}`);
}
process.exit(0);
