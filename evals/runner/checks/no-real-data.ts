#!/usr/bin/env tsx
/**
 * `pnpm check:no-real-data` — CI guard.
 *
 *  1. Every account slug under context/accounts/ matches the synthetic-corpus
 *     namespace regex OR is listed in evals/golden/allowed-slugs.txt.
 *  2. Every file under context/ (except context/schema/ and *.jsonl) carries
 *     `fictional: true` in its frontmatter.
 *  3. A short curated denylist of real-company tokens does not appear anywhere
 *     under context/.
 *
 * Exit non-zero with the offending paths listed.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { walkContext, parseFrontmatter } from "@agentic-sales-hub/context-core";

const here = dirname(fileURLToPath(import.meta.url));

function repoRoot(): string {
  let dir = here;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const NAMESPACE = /^(meridian-|acme-|northwind-|globex-|initech-)[a-z0-9-]+$/;

// Deliberately short; a tripwire, not a scanner.
const DENYLIST = ["salesforce.com", "hubspot.com", "oracle netsuite", "sap se", "acme corporation"];

async function main(): Promise<void> {
  const root = repoRoot();
  const errors: string[] = [];

  // 1. account slugs
  const accountsDir = join(root, "context/accounts");
  let slugs: string[] = [];
  try {
    slugs = (await readdir(accountsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    // no accounts yet is fine
  }
  const allowlistPath = join(root, "evals/golden/allowed-slugs.txt");
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
  const files = await walkContext(root);
  for (const rel of files) {
    if (rel.endsWith(".jsonl")) continue;
    const text = await readFile(join(root, rel), "utf8");
    const fm = parseFrontmatter(text).data;
    if (fm.fictional !== true) {
      errors.push(`${rel} is missing \`fictional: true\``);
    }
  }

  // 3. denylist tripwire
  for (const rel of files) {
    const text = (await readFile(join(root, rel), "utf8")).toLowerCase();
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
