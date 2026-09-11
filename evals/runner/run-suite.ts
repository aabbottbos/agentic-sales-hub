import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createLoader,
  normalizeNewlines,
  resolveContextRoot,
  resolveContextPath,
  type ContextLoader,
  type Finding,
  type RetrievalHit,
} from "@agentic-sales-hub/context-core";
import { runSkill, type SummaryOutput } from "@agentic-sales-hub/skills";
import {
  scoreRetrieval,
  scoreReview,
  scoreFindingCitations,
  scoreRetrievalCitations,
  scoreCommitmentRecall,
  type LabeledSpan,
} from "../scorers/index.js";
import { scoreRubric } from "../judge/judge.js";
import { runInjectionHarness } from "./injection-harness.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../..");

// No CLI flag for this — `evals/runner/cli.ts` doesn't expose a `--root`
// passthrough. `ASH_CONTEXT_ROOT` is sufficient for overriding the demo
// default; the CLI flag is out of scope here.
const CONTEXT_ROOT = resolveContextRoot({
  root: process.env.ASH_CONTEXT_ROOT ?? join(REPO_ROOT, "examples/demo-corpus"),
  cwd: REPO_ROOT,
});

export type SuiteName = "sow-review" | "find-evidence" | "call-summary";
export const ALL_SUITES: SuiteName[] = ["sow-review", "find-evidence", "call-summary"];

interface SowReviewCase {
  id: string;
  skill: "sow-review";
  input: { document_path: string };
  scope_params: { account_slug?: string; opp_id?: string };
  expected_findings_ref: string;
  injection: boolean;
  injection_write?: { file_path: string; content: string };
}

interface FindEvidenceCase {
  id: string;
  skill: "find-evidence";
  input: { situation: string; k?: number };
  scope_params: { account_slug?: string; opp_id?: string };
  relevant_spans: LabeledSpan[];
}

interface CallSummaryCase {
  id: string;
  skill: "call-summary";
  input: { meeting_path: string };
  scope_params: { account_slug?: string; opp_id?: string };
  expected_commitments_ref: string;
}

export interface CaseResult {
  id: string;
  metrics: Record<string, number>;
  gates: Record<string, "PASS" | "FAIL">;
  injectionBlocked: boolean | null;
  notes: string[];
}

export interface SuiteResult {
  suite: SuiteName;
  cases: CaseResult[];
  aggregate: Record<string, number>;
  gates: Record<string, "PASS" | "FAIL">;
}

const CASES_DIR = join(REPO_ROOT, "evals/cases");

function makeLoader(): Promise<ContextLoader> {
  return createLoader({
    repoRoot: REPO_ROOT,
    root: CONTEXT_ROOT,
    taintLedgerPath: join(REPO_ROOT, ".claude/.taint-ledger.eval.jsonl"),
  });
}

function toScopeParams(sp: { account_slug?: string; opp_id?: string }): {
  accountSlug?: string;
  oppId?: string;
} {
  return {
    ...(sp.account_slug ? { accountSlug: sp.account_slug } : {}),
    ...(sp.opp_id ? { oppId: sp.opp_id } : {}),
  };
}

export async function runSuite(suite: SuiteName): Promise<SuiteResult> {
  if (suite === "sow-review") return runReviewSuite();
  if (suite === "find-evidence") return runRetrievalSuite();
  return runGenerationSuite();
}

async function runReviewSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "sow-review");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as SowReviewCase;
    const labeled = JSON.parse(
      await readFile(join(dir, c.expected_findings_ref), "utf8"),
    ) as Finding[];

    const loader = await makeLoader();
    const result = await runSkill(
      "sow-review",
      { document_path: c.input.document_path },
      { loader, scopeParams: toScopeParams(c.scope_params) },
    );
    const produced = result.output as Finding[];

    const review = scoreReview(produced, labeled);
    const citations = await scoreFindingCitations(loader, produced);

    let injectionBlocked: boolean | null = null;
    const notes: string[] = [];
    if (c.injection && c.injection_write) {
      const harness = await runInjectionHarness(
        loader,
        REPO_ROOT,
        c.input.document_path,
        c.injection_write,
      );
      injectionBlocked = harness.blocked;
      notes.push(
        `injection harness: hook exit ${harness.hookExitCode}${harness.hookStderr ? ` — ${harness.hookStderr.slice(0, 120)}` : ""}`,
      );
    }

    const metrics = {
      blocker_recall: round(review.blockerRecall),
      severity_weighted_recall: round(review.severityWeightedRecall),
      precision: round(review.precision),
      citation_validity: round(citations.validity),
    };
    const gates: Record<string, "PASS" | "FAIL"> = {
      blocker_recall: review.blockerRecall >= 1 ? "PASS" : "FAIL",
      precision: review.precision >= 0.7 ? "PASS" : "FAIL",
      citation_validity: citations.validity >= 1 ? "PASS" : "FAIL",
    };
    if (injectionBlocked !== null) {
      gates.injection = injectionBlocked ? "PASS" : "FAIL";
    }
    if (citations.failures.length)
      notes.push(`citation failures: ${citations.failures.join("; ")}`);

    cases.push({ id: c.id, metrics, gates, injectionBlocked, notes });
  }

  return aggregateSuite("sow-review", cases);
}

async function runRetrievalSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "find-evidence");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as FindEvidenceCase;
    const loader = await makeLoader();
    const result = await runSkill(
      "find-evidence",
      { situation: c.input.situation, ...(c.input.k ? { k: c.input.k } : {}) },
      { loader, scopeParams: toScopeParams(c.scope_params) },
    );
    const hits = result.output as RetrievalHit[];

    const retrieval = scoreRetrieval(hits, c.relevant_spans, c.input.k ?? 5);
    const citations = await scoreRetrievalCitations(loader, hits);

    const metrics = {
      recall: round(retrieval.recall),
      precision_at_k: round(retrieval.precisionAtK),
      citation_validity: round(citations.validity),
    };
    const gates: Record<string, "PASS" | "FAIL"> = {
      recall: retrieval.recall >= 0.9 ? "PASS" : "FAIL",
      citation_validity: citations.validity >= 1 ? "PASS" : "FAIL",
    };
    const notes: string[] = [];
    if (citations.failures.length)
      notes.push(`citation failures: ${citations.failures.join("; ")}`);

    cases.push({ id: c.id, metrics, gates, injectionBlocked: null, notes });
  }

  return aggregateSuite("find-evidence", cases);
}

async function runGenerationSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "call-summary");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as CallSummaryCase;
    const labeled = JSON.parse(await readFile(join(dir, c.expected_commitments_ref), "utf8")) as {
      text: string;
    }[];

    const loader = await makeLoader();
    const result = await runSkill(
      "call-summary",
      { meeting_path: c.input.meeting_path },
      { loader, scopeParams: toScopeParams(c.scope_params) },
    );
    const output = result.output as SummaryOutput;

    const recall = scoreCommitmentRecall(
      { commitments: output.commitments, next_steps: output.next_steps },
      labeled,
    );

    // Citation validity: resolve-only over the flattened citation set. runSkill's
    // generation branch already gated this (result.citationsValid); recompute here
    // for per-citation failure detail in the report.
    const flatCitations = [
      ...output.citations,
      ...output.commitments.map((x) => x.citation),
      ...output.next_steps.map((x) => x.citation),
      ...output.context_deltas.map((x) => x.citation),
    ].map((cit) => ({ path: cit.path, span: cit.span, relevance: 1, why: "" }));
    const citations = await scoreRetrievalCitations(loader, flatCitations);

    const noteText = normalizeNewlines(
      await readFile(resolveContextPath(c.input.meeting_path, CONTEXT_ROOT), "utf8"),
    );
    const rubric = await scoreRubric(output, noteText);

    const metrics = {
      rubric_aggregate: round(rubric.aggregate),
      commitment_recall: round(recall.recall),
      citation_validity: round(citations.validity),
    };
    // `citation_validity` is the one hard blocking gate for call-summary: it is a
    // deterministic resolve-only span check and is stable at 1.00 every run.
    //
    // `rubric_aggregate` (single LLM judge) and `commitment_recall` (token-overlap
    // against hand-written labels — too literal to bridge a valid paraphrase like
    // "get the redlines reviewed fast" vs. "review the counterparty redlines
    // quickly") are BOTH ADVISORY: computed, printed, and regression-tracked via
    // compare.ts PRIMARY, but not gates. See evals/judge/README.md + spec 002
    // OQ2 amendment A1.
    const gates: Record<string, "PASS" | "FAIL"> = {
      citation_validity: citations.validity >= 1 ? "PASS" : "FAIL",
    };
    const rubricNote = rubric.unavailable
      ? "rubric: judge unavailable (advisory — not gated)"
      : `rubric aggregate ${round(rubric.aggregate)}${
          rubric.aggregate >= 4.0 ? "" : " (advisory target 4.0)"
        }; dims g=${rubric.grounding} c=${rubric.completeness} t=${rubric.tone} s=${rubric.structure} (${rubric.attempts.length} judge attempts)`;
    const notes: string[] = [rubricNote];
    notes.push(
      `commitment recall ${round(recall.recall)} (advisory target 0.90)${
        recall.misses.length ? ` — missed: ${recall.misses.join("; ")}` : ""
      }`,
    );
    if (citations.failures.length)
      notes.push(`citation failures: ${citations.failures.join("; ")}`);

    cases.push({ id: c.id, metrics, gates, injectionBlocked: null, notes });
  }

  return aggregateSuite("call-summary", cases);
}

function aggregateSuite(suite: SuiteName, cases: CaseResult[]): SuiteResult {
  const aggregate: Record<string, number> = {};
  const metricNames = new Set<string>();
  for (const c of cases) for (const m of Object.keys(c.metrics)) metricNames.add(m);
  for (const m of metricNames) {
    const vals = cases.map((c) => c.metrics[m]).filter((v): v is number => v !== undefined);
    aggregate[m] = vals.length ? round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  }

  const gates: Record<string, "PASS" | "FAIL"> = {};
  for (const c of cases) {
    for (const [g, v] of Object.entries(c.gates)) {
      if (v === "FAIL") gates[g] = "FAIL";
      else if (!(g in gates)) gates[g] = "PASS";
    }
  }
  return { suite, cases, aggregate, gates };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
