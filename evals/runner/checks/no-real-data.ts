#!/usr/bin/env tsx
/**
 * `pnpm check:no-real-data` — CI guard.
 *
 *  1. Every account slug under the configured corpus root's accounts/ matches
 *     the synthetic-corpus namespace regex OR is listed in
 *     evals/golden/allowed-slugs.txt.
 *  2. Every file under the configured corpus root (except schema/ and
 *     *.jsonl) carries `fictional: true` in its frontmatter.
 *  3. A short curated denylist of real-company tokens does not appear
 *     anywhere under the corpus root.
 *
 * The corpus root defaults to `examples/demo-corpus`; override with
 * `--root <path>` or `ASH_CONTEXT_ROOT`.
 *
 * Exit non-zero with the offending paths listed.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  walkContext,
  parseFrontmatter,
  resolveContextRoot,
  resolveContextPath,
} from "@agentic-sales-hub/context-core";

const here = dirname(fileURLToPath(import.meta.url));

function repoRoot(): string {
  let dir = here;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

function parseRootFlag(argv: string[]): string | undefined {
  const eq = argv.find((a) => a.startsWith("--root="));
  if (eq) return eq.slice("--root=".length);
  const idx = argv.indexOf("--root");
  if (idx !== -1 && argv[idx + 1] !== undefined) return argv[idx + 1];
  return undefined;
}

const NAMESPACE = /^(meridian-|acme-|northwind-|globex-|initech-)[a-z0-9-]+$/;

// Deliberately short; a tripwire, not a scanner.
const DENYLIST = ["salesforce.com", "hubspot.com", "oracle netsuite", "sap se", "acme corporation"];

async function main(): Promise<void> {
  const repoRootDir = repoRoot();
  const rootFlag = parseRootFlag(process.argv.slice(2));
  const contextRoot = resolveContextRoot({
    root: rootFlag ?? process.env.ASH_CONTEXT_ROOT ?? "examples/demo-corpus",
    cwd: repoRootDir,
  });
  const errors: string[] = [];

  // 1. account slugs
  const accountsDir = join(contextRoot, "accounts");
  let slugs: string[] = [];
  try {
    slugs = (await readdir(accountsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    // no accounts yet is fine
  }
  const allowlistPath = join(repoRootDir, "evals/golden/allowed-slugs.txt");
  const allowlist = existsSync(allowlistPath)
    ? (await readFile(allowlistPath, "utf8"))
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : [];
  for (const slug of slugs) {
    if (!NAMESPACE.test(slug) && !allowlist.includes(slug)) {
      errors.push(`account slug "${slug}" is not in the synthetic namespace or the allowlist`);
    }
  }

  // 2. fictional: true on every context file
  const files = await walkContext(contextRoot);
  for (const rel of files) {
    if (rel.endsWith(".jsonl")) continue;
    const text = await readFile(resolveContextPath(rel, contextRoot), "utf8");
    const fm = parseFrontmatter(text).data;
    if (fm.fictional !== true) {
      errors.push(`${rel} is missing \`fictional: true\``);
    }
  }

  // 3. denylist tripwire
  for (const rel of files) {
    const text = (await readFile(resolveContextPath(rel, contextRoot), "utf8")).toLowerCase();
    for (const token of DENYLIST) {
      if (text.includes(token)) {
        errors.push(`${rel} contains denylisted token "${token}"`);
      }
    }
  }

  if (errors.length === 0) {
    console.log(
      `check:no-real-data — OK (${files.length} context files, ${slugs.length} account slugs)`,
    );
    process.exit(0);
  }
  console.error(`check:no-real-data — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

await main();
