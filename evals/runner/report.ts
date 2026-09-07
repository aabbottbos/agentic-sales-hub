import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { SuiteResult } from "./run-suite.js";
import { REPO_ROOT } from "./run-suite.js";

export interface RunReport {
  date: string;
  sha: string;
  node: string;
  schema_version: string;
  suites: Record<string, SuiteResult>;
  regression_vs: string | null;
  regression_verdict: "PASS" | "REGRESSION" | "N/A";
}

export function shortSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT })
      .toString()
      .trim();
  } catch {
    return "nogit";
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildReport(suites: SuiteResult[]): RunReport {
  return {
    date: today(),
    sha: shortSha(),
    node: process.version,
    schema_version: "1.0.0",
    suites: Object.fromEntries(suites.map((s) => [s.suite, s])),
    regression_vs: null,
    regression_verdict: "N/A",
  };
}

export function anyGateFailed(report: RunReport): boolean {
  return Object.values(report.suites).some((s) => Object.values(s.gates).some((g) => g === "FAIL"));
}

export function printTable(report: RunReport): void {
  for (const suite of Object.values(report.suites)) {
    console.log(`\n${suite.suite}`);
    for (const c of suite.cases) {
      const metrics = Object.entries(c.metrics)
        .map(([k, v]) => `${k}=${v}`)
        .join("  ");
      const gates = Object.entries(c.gates)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      console.log(`  ${c.id.padEnd(24)} ${metrics}   [${gates}]`);
      for (const n of c.notes) console.log(`    ${n}`);
    }
    const agg = Object.entries(suite.aggregate)
      .map(([k, v]) => `${k}=${v}`)
      .join("  ");
    const aggGates = Object.entries(suite.gates)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(`  ${"AGGREGATE".padEnd(24)} ${agg}   [${aggGates}]`);
  }
  console.log(`\nregression vs ${report.regression_vs ?? "(none)"}: ${report.regression_verdict}`);
}

export async function writeResult(report: RunReport): Promise<string> {
  const dir = join(REPO_ROOT, "evals/results");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${report.date}-${report.sha}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", "utf8");
  return path;
}
