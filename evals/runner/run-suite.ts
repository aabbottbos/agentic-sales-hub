import { readdir, readFile, writeFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
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
// Deep import into the built package (not the public surface) to reach
// `_setClientForTest` — the ONE sanctioned seam llm.ts itself exports for
// swapping the real Anthropic client with a deterministic fake (see that
// file's own doc comment). A plain named-export reassignment (the
// `vi.spyOn(llm, "complete")` trick packages/mcp-agentic-sales-hub's own
// tests use) does not work outside Vitest's module transform — ESM named
// exports are read-only bindings under plain tsx — so this script uses the
// seam llm.ts actually provides for non-Vitest callers instead.
//
// Used ONLY by runWatcherTriggerSuite() below: that suite exists to prove
// the watcher's trigger + actor-attribution pipeline, not call-summary's LLM
// output quality (already covered, with the real model, by the call-summary
// suite's own gates) — a real completion's exact wording is out of this
// suite's control and can otherwise trip the taint check on an incidental
// verbatim echo of the quarantined transcript, which is a
// call-summary/taint-ledger concern, not a watcher-wiring one.
import { _setClientForTest } from "../../packages/skills/dist/impl/llm.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createInboundWatcher,
  FILE_WATCHER_ACTOR,
  registerCallSummaryTool,
  getSharedLoader,
  resetSharedLoaderForTests,
} from "@agentic-sales-hub/mcp-agentic-sales-hub";
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
const JUDGE_DIR = join(REPO_ROOT, "evals/judge");

// No CLI flag for this — `evals/runner/cli.ts` doesn't expose a `--root`
// passthrough. `ASH_CONTEXT_ROOT` is sufficient for overriding the demo
// default; the CLI flag is out of scope here.
const CONTEXT_ROOT = resolveContextRoot({
  root: process.env.ASH_CONTEXT_ROOT ?? join(REPO_ROOT, "examples/demo-corpus"),
  cwd: REPO_ROOT,
});

export type SuiteName =
  | "sow-review"
  | "find-evidence"
  | "call-summary"
  | "call-prep"
  | "watcher-trigger";
export const ALL_SUITES: SuiteName[] = [
  "sow-review",
  "find-evidence",
  "call-summary",
  "call-prep",
  "watcher-trigger",
];

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

interface CallPrepCase {
  id: string;
  skill: "call-prep";
  input: { account_slug: string; opp_id: string; meeting_context?: string };
  scope_params: { account_slug?: string; opp_id?: string };
}

interface WatcherTriggerCase {
  id: string;
  skill: "watcher-trigger";
  /** Filename of the inbound fixture (in the same directory as this case
   *  file) to copy into the scratch corpus's inbound/** for the opportunity
   *  named by scope_params. */
  fixture: string;
  scope_params: { account_slug: string; opp_id: string };
  expected_actor: { type: "human" | "system"; id: string };
}

// Mirrors packages/skills/src/impl/brief-schema.ts's `BriefOutput` — not
// exported from @agentic-sales-hub/skills's public surface (only
// FindEvidenceOutput/SowReviewOutput/SummaryOutput/CallSummaryOutput are), so
// this is a structurally-equivalent local type for scoring purposes only.
interface BriefOutputForEval {
  goal: string;
  what_we_know: { text: string; citation: { path: string; span: [number, number] } }[];
  talking_points: { text: string; citation: { path: string; span: [number, number] } }[];
  risks: { text: string; citation: { path: string; span: [number, number] } }[];
  citations: { path: string; span: [number, number] }[];
  unsourced_claims: string[];
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
  if (suite === "call-summary") return runGenerationSuite();
  if (suite === "call-prep") return runCallPrepSuite();
  return runWatcherTriggerSuite();
}

/**
 * Copy `examples/demo-corpus/` into a fresh mkdtemp scratch directory. Used
 * ONLY by `runCallPrepSuite()` — call-prep's `runSkill` calls
 * `ctx.loader.writeArtifact()` for real (it has a write grant and
 * `requires_citations: true`), so it must never run against the committed
 * corpus. Deliberately a separate, module-local implementation — not an
 * import of context-core's test-dir `tempCorpus()` helper (evals/ does not
 * reach across that boundary).
 */
async function scratchCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ash-eval-call-prep-"));
  const root = join(tmpDir, "demo-corpus");
  await cp(join(REPO_ROOT, "examples/demo-corpus"), root, { recursive: true });
  return { tmpDir, root };
}

/**
 * Like `scratchCorpus()`, but names the copied corpus directory `context`
 * (rather than `demo-corpus`) directly under `tmpDir` — required specifically
 * for `runWatcherTriggerSuite()`, since `createInboundWatcher` hardcodes the
 * directory it watches as `join(repoRoot, "context")` (mirrors
 * `packages/mcp-agentic-sales-hub/src/watcher.test.ts`'s own
 * `scratchCorpus()` helper and its explanatory comment).
 */
async function scratchCorpusAtContextPath(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ash-eval-watcher-"));
  const root = join(tmpDir, "context");
  await cp(join(REPO_ROOT, "examples/demo-corpus"), root, { recursive: true });
  return { tmpDir, root };
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

  cases.push(await runCallSummaryViaMcpToolCase());

  return aggregateSuite("call-summary", cases);
}

/**
 * spec 005's Eval-impact section: "`call-summary` ... run once directly
 * (today's path, unchanged) and once through an MCP tool call, per the
 * intent's 'How we'll know it worked' criterion." The loop above is the
 * "direct" path (unchanged `runSkill` call against the committed corpus,
 * exactly as before this task). This is the "once through an MCP tool call"
 * variant: drives the same skill through `registerCallSummaryTool`'s actual
 * registered handler (an `McpServer` instance, `.handler(...)` invoked
 * directly — no transport, mirroring
 * `packages/mcp-agentic-sales-hub/src/tools/call-summary-tool.test.ts`'s own
 * test pattern), proving the MCP-wrapping layer itself (actor threading,
 * render -> taint-check -> writeArtifact) doesn't break anything the direct
 * `runSkill` path above doesn't already cover.
 *
 * Unlike the direct-path cases, the MCP tool handler persists for real
 * (`writeArtifact`), so this runs against its own `scratchCorpus()` copy, and
 * points the package's shared, module-cached loader at that scratch root via
 * `ASH_CONTEXT_ROOT`/`ASH_TAINT_LEDGER_PATH` — the same mechanism
 * `call-summary-tool.test.ts` uses — resetting the cache before and after so
 * this suite run never leaks a scratch-pointed loader into any other case.
 */
async function runCallSummaryViaMcpToolCase(): Promise<CaseResult> {
  const meetingPath = `context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-08-28-negotiation.md`;
  const { tmpDir, root } = await scratchCorpus();
  const prevContextRoot = process.env.ASH_CONTEXT_ROOT;
  const prevTaintLedgerPath = process.env.ASH_TAINT_LEDGER_PATH;

  try {
    process.env.ASH_CONTEXT_ROOT = root;
    process.env.ASH_TAINT_LEDGER_PATH = join(tmpDir, ".taint-ledger.jsonl");
    resetSharedLoaderForTests();

    const server = new McpServer({ name: "eval-runner", version: "0.0.0" });
    const tool = registerCallSummaryTool(server);
    const actor = { type: "system" as const, id: "eval-runner" };

    const callToolResult = await (
      tool.handler as (
        args: { actor: typeof actor; meeting_path: string },
        extra: unknown,
      ) => Promise<{ content: { type: string; text: string }[] }>
    )({ actor, meeting_path: meetingPath }, {});

    const parsed = JSON.parse(callToolResult.content[0]!.text) as {
      artifactPath?: string;
      citationsValid?: boolean;
      output?: SummaryOutput;
    };

    const loader = await getSharedLoader();
    const output = parsed.output as SummaryOutput;
    const flatCitations = [
      ...output.citations,
      ...output.commitments.map((x) => x.citation),
      ...output.next_steps.map((x) => x.citation),
      ...output.context_deltas.map((x) => x.citation),
    ].map((cit) => ({ path: cit.path, span: cit.span, relevance: 1, why: "" }));
    const citations = await scoreRetrievalCitations(loader, flatCitations);

    const persisted = parsed.artifactPath ? await loader.read(parsed.artifactPath) : null;

    const metrics = {
      citation_validity: round(citations.validity),
    };
    const gates: Record<string, "PASS" | "FAIL"> = {
      citation_validity: citations.validity >= 1 ? "PASS" : "FAIL",
      mcp_tool_call: parsed.artifactPath && persisted?.frontmatter.actor ? "PASS" : "FAIL",
    };
    const notes: string[] = [
      `driven via registerCallSummaryTool's handler (MCP tool call), not a direct runSkill call`,
      `artifact written to scratch corpus: ${parsed.artifactPath ?? "(none)"}`,
    ];
    if (citations.failures.length)
      notes.push(`citation failures: ${citations.failures.join("; ")}`);

    return {
      id: "negotiation-via-mcp-tool",
      metrics,
      gates,
      injectionBlocked: null,
      notes,
    };
  } finally {
    resetSharedLoaderForTests();
    if (prevContextRoot === undefined) delete process.env.ASH_CONTEXT_ROOT;
    else process.env.ASH_CONTEXT_ROOT = prevContextRoot;
    if (prevTaintLedgerPath === undefined) delete process.env.ASH_TAINT_LEDGER_PATH;
    else process.env.ASH_TAINT_LEDGER_PATH = prevTaintLedgerPath;
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * call-prep is the one generation suite where `runSkill` actually persists —
 * it has a write grant and `requires_citations: true`, so a citation-valid
 * run calls `ctx.loader.writeArtifact()` for real (a new artifact file plus
 * an `outcomes.jsonl` append). Every case therefore runs against its own
 * `scratchCorpus()` copy, never `examples/demo-corpus/` directly, and the
 * scratch dir is removed in `finally` even on failure.
 */
async function runCallPrepSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "call-prep");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as CallPrepCase;
    const { tmpDir, root } = await scratchCorpus();
    try {
      const loader = await createLoader({ repoRoot: REPO_ROOT, root });
      const result = await runSkill(
        "call-prep",
        {
          account_slug: c.input.account_slug,
          opp_id: c.input.opp_id,
          ...(c.input.meeting_context ? { meeting_context: c.input.meeting_context } : {}),
        },
        {
          loader,
          scopeParams: toScopeParams(c.scope_params),
          actor: { type: "system", id: "eval-runner" },
        },
      );
      const output = result.output as BriefOutputForEval;

      const flatForScoring = [
        ...output.citations,
        ...output.what_we_know.map((x) => x.citation),
        ...output.talking_points.map((x) => x.citation),
        ...output.risks.map((x) => x.citation),
      ].map((cit) => ({ path: cit.path, span: cit.span, relevance: 1, why: "" }));
      const citations = await scoreRetrievalCitations(loader, flatForScoring);

      // judge.ts's scoreRubric() reads rubricFile/promptFile as a plain
      // readFileSync path (not resolved relative to evals/judge/ itself — see
      // judge.test.ts's own call sites), so these must be joined against
      // JUDGE_DIR here rather than passed as bare filenames.
      const rubric = await scoreRubric(output, flatForScoring.map((c) => c.path).join("\n"), {
        rubricFile: join(JUDGE_DIR, "call-prep-rubric.md"),
        promptFile: join(JUDGE_DIR, "call-prep-judge-prompt.md"),
      });

      cases.push({
        id: c.id,
        metrics: {
          rubric_aggregate: round(rubric.aggregate),
          citation_validity: round(citations.validity),
        },
        gates: { citation_validity: citations.validity >= 1 ? "PASS" : "FAIL" },
        injectionBlocked: null,
        notes: [
          `rubric aggregate ${round(rubric.aggregate)} (advisory target 4.0)`,
          `artifact written to scratch corpus: ${result.artifactPath}`,
          ...(citations.failures.length
            ? [`citation failures: ${citations.failures.join("; ")}`]
            : []),
        ],
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  return aggregateSuite("call-prep", cases);
}

/**
 * Proves the file-watcher trigger (plan 005 Task 10) end-to-end: dropping a
 * transcript-shaped fixture into a scratch corpus's `inbound/**` fires
 * `call-summary` automatically, with no human action, and the resulting
 * artifact + `outcomes.jsonl` record both carry the fixed sentinel actor
 * `{type: "system", id: "file-watcher"}` (spec 005 Eval-impact).
 *
 * Unlike the other suites, a "case" here isn't a scored request/response
 * pair — it's "does the automatic trigger fire and attribute correctly."
 * There is no numeric metric to average; `aggregate`/`gates` are structured
 * as a binary pass/fail (`aggregate.trigger_fired` is 1 or 0,
 * `gates.watcher_trigger` is PASS/FAIL) so `report.ts`'s table/JSON output
 * handles this suite the same way it handles every other `SuiteResult`.
 *
 * Builds its own scratch corpus + loader (mirroring `runCallPrepSuite()`'s
 * shape) since the watcher writes for real via `loader.writeArtifact()` —
 * this must never run against the committed `examples/demo-corpus/`.
 */
async function runWatcherTriggerSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "watcher-trigger");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as WatcherTriggerCase;
    // Cross-check: the case file's expected_actor should always match the
    // real sentinel FILE_WATCHER_ACTOR the watcher actually mints — catches
    // drift if either one is ever edited without the other.
    if (
      c.expected_actor.type !== FILE_WATCHER_ACTOR.type ||
      c.expected_actor.id !== FILE_WATCHER_ACTOR.id
    ) {
      throw new Error(
        `watcher-trigger case "${c.id}": expected_actor ${JSON.stringify(c.expected_actor)} ` +
          `does not match the real FILE_WATCHER_ACTOR ${JSON.stringify(FILE_WATCHER_ACTOR)}`,
      );
    }
    const { tmpDir, root } = await scratchCorpusAtContextPath();
    // Short debounce for eval speed (Task 10's own tests use ~200ms in test
    // contexts for the same reason) — not the 400ms production default.
    const debounceMs = 200;
    const settleMarginMs = 650;
    const pollIntervalMs = 50;

    const loader = await createLoader({
      repoRoot: tmpDir,
      root,
      schemaDir: join(REPO_ROOT, "context/schema"),
      taintLedgerPath: join(tmpDir, ".taint-ledger.jsonl"),
    });
    const watcher = createInboundWatcher({ loader, repoRoot: tmpDir, debounceMs });

    const notes: string[] = [];
    let triggerFired = false;
    let actorMatches = false;

    // Stub the LLM client with a deterministic, non-tainted summary — see the
    // import comment above for why. Reset in `finally` unconditionally so a
    // failure here never leaks a fake client into a later suite (e.g. `all`
    // running call-summary/call-prep for real afterward).
    _setClientForTest({
      messages: {
        create: () =>
          Promise.resolve({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  summary:
                    "Acme confirmed hypercare and the connector add-on timing, and asked for written confirmation of the launch date.",
                  commitments: [],
                  next_steps: [],
                  context_deltas: [],
                  citations: [],
                  unsourced_claims: [],
                }),
              },
            ],
          }),
      },
    });

    try {
      const oppDir = `context/accounts/${c.scope_params.account_slug}/opportunities/${c.scope_params.opp_id}`;
      const inboundDir = join(
        root,
        "accounts",
        c.scope_params.account_slug,
        "opportunities",
        c.scope_params.opp_id,
        "inbound",
      );
      await mkdir(inboundDir, { recursive: true });

      // The reused acme-logistics/006Ax0000GkLmNpQAA opportunity already has
      // pre-existing artifacts in the demo corpus (a-0001-brief.md,
      // a-0002-proposal.md) — snapshot those BEFORE dropping the fixture so
      // the poll below only accepts a genuinely NEW file the watcher wrote,
      // not one that already existed.
      const artifactsDir = join(
        root,
        "accounts",
        c.scope_params.account_slug,
        "opportunities",
        c.scope_params.opp_id,
        "artifacts",
      );
      let preExisting: Set<string>;
      try {
        preExisting = new Set((await readdir(artifactsDir)).filter((f) => f.endsWith(".md")));
      } catch {
        preExisting = new Set();
      }

      const fixtureContent = await readFile(join(dir, c.fixture), "utf8");
      const destLogicalPath = `${oppDir}/inbound/${c.fixture.replace(/\.inbound\.md$/, ".md")}`;
      await writeFile(resolveContextPath(destLogicalPath, root), fixtureContent, "utf8");

      // Poll for the new artifact rather than a fixed sleep, bounded by the
      // debounce window plus a settle margin — per the plan's own phrasing
      // ("awaits the trigger ... bounded by debounce+margin").
      const deadline = Date.now() + debounceMs + settleMarginMs;
      let artifactPath: string | undefined;
      while (Date.now() < deadline && !artifactPath) {
        try {
          const entries = (await readdir(artifactsDir)).filter(
            (f) => f.endsWith(".md") && !preExisting.has(f),
          );
          if (entries.length > 0) {
            artifactPath = `${oppDir}/artifacts/${entries.sort().at(-1)}`;
          }
        } catch {
          // artifacts/ may not exist yet — keep polling.
        }
        if (!artifactPath) await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      if (!artifactPath) {
        notes.push(
          `no artifact appeared under ${artifactsDir} within ${debounceMs + settleMarginMs}ms`,
        );
      } else {
        triggerFired = true;
        const artifact = await loader.read(artifactPath);
        const artifactActor = artifact.frontmatter.actor as
          | { type: string; id: string }
          | undefined;

        const outcomesPath = join(
          root,
          "accounts",
          c.scope_params.account_slug,
          "opportunities",
          c.scope_params.opp_id,
          "outcomes.jsonl",
        );
        const outcomesRaw = await readFile(outcomesPath, "utf8");
        const outcomeLines = outcomesRaw
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((l) => JSON.parse(l) as { artifact: string; actor: { type: string; id: string } });
        const outcomeRecord = outcomeLines.find((o) => o.artifact === artifactPath);

        const expected = c.expected_actor;
        const artifactActorOk =
          !!artifactActor &&
          artifactActor.type === expected.type &&
          artifactActor.id === expected.id;
        const outcomeActorOk =
          !!outcomeRecord &&
          outcomeRecord.actor.type === expected.type &&
          outcomeRecord.actor.id === expected.id;
        actorMatches = artifactActorOk && outcomeActorOk;

        notes.push(`artifact: ${artifactPath} actor=${JSON.stringify(artifactActor)}`);
        notes.push(
          outcomeRecord
            ? `outcome record found for ${artifactPath}, actor=${JSON.stringify(outcomeRecord.actor)}`
            : `no outcome record found for artifact ${artifactPath} in ${outcomesPath}`,
        );
        if (!actorMatches) {
          notes.push(
            `expected actor ${JSON.stringify(expected)} on both artifact and outcome; ` +
              `artifact match=${artifactActorOk} outcome match=${outcomeActorOk}`,
          );
        }
      }
    } finally {
      watcher.close();
      _setClientForTest(null);
      await rm(tmpDir, { recursive: true, force: true });
    }

    const passed = triggerFired && actorMatches;
    cases.push({
      id: c.id,
      metrics: { trigger_fired: passed ? 1 : 0 },
      gates: { watcher_trigger: passed ? "PASS" : "FAIL" },
      injectionBlocked: null,
      notes,
    });
  }

  return aggregateSuite("watcher-trigger", cases);
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
