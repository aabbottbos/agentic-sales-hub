#!/usr/bin/env tsx
/**
 * `pnpm eval --suite <sow-review|find-evidence|all>`
 *
 * Flags:
 *   --suite <name|all>   required
 *   --write-results      write evals/results/<date>-<sha>.json (default: true in CI)
 *   --no-compare         skip the regression comparison
 *   --json               print the raw report JSON instead of the table
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ALL_SUITES, REPO_ROOT, runSuite, type SuiteName } from "./run-suite.js";
import { anyGateFailed, buildReport, printTable, writeResult, type RunReport } from "./report.js";
import { compareReports } from "./compare.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function latestCommittedResult(): Promise<RunReport | null> {
  const dir = join(REPO_ROOT, "evals/results");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.json$/.test(f)).sort();
  } catch {
    return null;
  }
  const last = files.at(-1);
  if (!last) return null;
  return JSON.parse(await readFile(join(dir, last), "utf8")) as RunReport;
}

async function main(): Promise<void> {
  const suiteArg = arg("suite");
  if (!suiteArg) {
    console.error("usage: pnpm eval --suite <sow-review|find-evidence|all>");
    process.exit(2);
  }
  const suites: SuiteName[] = suiteArg === "all" ? [...ALL_SUITES] : ([suiteArg] as SuiteName[]);

  const inCI = process.env.CI === "true" || process.env.CI === "1";
  const writeResults = flag("write-results") || inCI;
  const doCompare = !flag("no-compare");

  // Clear the eval taint ledger so runs are independent.
  await rm(join(REPO_ROOT, ".claude/.taint-ledger.eval.jsonl"), { force: true });

  const results = [];
  for (const s of suites) results.push(await runSuite(s));

  const report = buildReport(results);

  if (doCompare) {
    const previous = await latestCommittedResult();
    const cmp = compareReports(report, previous);
    report.regression_vs = previous ? `${previous.date}-${previous.sha}` : null;
    report.regression_verdict = previous ? cmp.verdict : "N/A";
    if (cmp.regressions.length) {
      for (const r of cmp.regressions) console.error(`REGRESSION: ${r}`);
    }
  }

  if (flag("json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTable(report);
  }

  if (writeResults) {
    const path = await writeResult(report);
    console.log(`\nwrote ${path.replace(REPO_ROOT + "/", "")}`);
  }

  await rm(join(REPO_ROOT, ".claude/.taint-ledger.eval.jsonl"), { force: true });

  const gateFail = anyGateFailed(report);
  const regressed = report.regression_verdict === "REGRESSION";
  if (gateFail || regressed) {
    console.error(
      `\nFAILED: ${gateFail ? "gate breach" : ""}${gateFail && regressed ? " + " : ""}${regressed ? "net regression" : ""}`,
    );
    process.exit(1);
  }
  console.log("\nAll gates pass.");
}

await main();
