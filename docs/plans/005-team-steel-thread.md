# Plan: 005 — Team steel thread (identity, concurrent writes, background trigger)

**Spec:** `docs/specs/005-team-steel-thread.md` (all Judgment calls / Open questions resolved)
**Intent:** `docs/intent/005-team-steel-thread.md`

## Context

Spec 005's blocker (intent 004 not shipped) is resolved — PR #21 merged `writeArtifact()`, `call-prep.ts`/`.yaml`, and `brief-output.json` to `origin/main`. **However, the current branch (`intent/005-team-steel-thread`) was cut before that merge and does not have it** — `git merge-base HEAD origin/main` shows exactly one commit (`98a6e74`, PR #21) on `origin/main` that this branch lacks. This must be merged in before any implementation task below, since every file this plan touches (`write-path.ts`, `runner.ts`, `call-prep.yaml`, etc.) only exists post-merge.

This plan builds `packages/mcp-agentic-sales-hub`: a long-running MCP server exposing two tools (`skill.call-prep`, `skill.call-summary`) that add three things on top of the existing `runSkill`/`writeArtifact`/`appendOutcome` write path, per spec 005: (1) mandatory actor attribution on every write, (2) per-opportunity write serialization, (3) a background file-watcher that auto-triggers `call-summary` on a new `inbound/**` file, with no human in the loop.

**One real gap found during design, requiring a small spec amendment (confirmed with the user):** `call-summary.yaml`'s read grant is `meetings/**` only, and its impl reads via `ctx.loader.read()`, not `readInbound()` — it has no way to process an `inbound/**` file today. Spec 005's watcher narrative assumes it can. Resolution (user-confirmed): widen `call-summary.yaml`'s read grant to include `context/accounts/*/opportunities/*/inbound/**`, and give the impl a path-shape branch (`meetingPath.includes("/inbound/")`) that calls `ctx.loader.readInbound()` + `extractUntrusted()` instead of `ctx.loader.read()`. `CallSummaryInput` stays `{meeting_path: string}` — unchanged shape, just a widened grant and a new internal branch. This is a small, additive touch to `call-summary.yaml`/`call-summary.ts`, not a rewrite of its contract (inputs/output schema unchanged) — spec 005's "Skill contract" section gets a one-line amendment noting this before/alongside this plan's commit.

## Actor-threading design (resolves spec JC#5's stated tension)

`RunContext` (`packages/skills/src/types.ts`) gains an optional `actor?: Actor` field — a runner-level invocation-metadata field, same category as `scopeParams`, not a skill-definition/`inputs` change. `runSkill`'s existing internal `writeArtifact` call (the one it already makes for `call-prep`, since `call-prep.yaml` has a write grant) threads `ctx.actor` through and throws if absent. For `call-summary` (no write grant — `runSkill` returns output only), the MCP tool handler uses the same `actor` value directly for its own subsequent `writeArtifact` call — exactly mirroring how `writeFindings` is `sow-review`'s "separate step" today.

`Actor` is defined once in `packages/context-core/src/types.ts` (`{type: "human"|"system", id: string}`), exported from `context-core`, and re-exported from `packages/skills/src/types.ts` (matching the existing `SkillDefinition` re-export pattern).

## Per-opportunity queue: lives in `context-core`, not the MCP package

`ContextLoader.writeArtifact`/`.appendOutcome` (the actual things needing serialization) route through a `Map<string, Promise>`-chaining queue keyed on `` `${accountSlug}::${crmId}` ``, wired inside `createLoader()`. This makes serialization a loader-level guarantee for *any* caller (MCP server, evals, a future CLI), not an MCP-server-only behavior — consistent with `context-core` already owning every other write-path guarantee (`flag: "wx"`, `assertAppendOnly`, the taint ledger). Scoped to one loader instance's lifetime (a documented, accepted limit — matches the spec's own "single in-process mutex" non-goal). `write-path.ts`'s internal call to the raw `appendOutcome` function (not `loader.appendOutcome`) stays outside the queue, since it already bypasses the loader today — this is what prevents `writeArtifact`'s auto-opened outcome write from deadlocking against its own enclosing queued call.

## Task breakdown

**Task 0 — Sync branch. DONE.** Merged `origin/main` into `intent/005-team-steel-thread` (commit `7614e2e`), bringing in PR #21.

**Task 1 — `Actor` type + schema changes.**
- `packages/context-core/src/types.ts`: add `Actor`, export from `index.ts`.
- `context/schema/artifact.json`: add `actor` to `properties` (object, `{type: enum[human,system], id: string minLength 1}`, `required:[type,id]`, `additionalProperties:false`) and to the top-level `required` array (after `superseded`, before `citations`). Declared directly in this schema's own `properties` (not via `frontmatter-common.json`, per spec) — `unevaluatedProperties:false` already permits any property declared here.
- `context/schema/outcome.json`: same `actor` property block; add to its flat `required` array. No `allOf`, so this is the schema's own `properties`/`required` directly, as the spec specifies.
- `packages/context-core/src/schema/registry.ts`: bump `SCHEMA_VERSION` from `"1.0.0"` to `"1.1.0"`.
- Expect `pnpm corpus:validate` to fail against `examples/demo-corpus/` until Task 2 lands — land Tasks 1+2 together, don't merge Task 1 alone against a CI gate that runs `corpus:validate`.

**Task 2 — Migration script + backfill.**
- `packages/context-core/src/backfill-actor.ts`: `backfillActor(root): Promise<BackfillReport>` — walks `accounts/**/opportunities/**/artifacts/*.md` and `.../outcomes.jsonl`, injects `actor: {type:"system", id:"legacy"}` into any record missing it, bumps that record's `schema_version` to `1.1.0` (since it's being rewritten to now conform), idempotent (no-op on already-migrated files).
- `packages/context-core/scripts/backfill-actor.ts`: CLI wrapper (mirrors `validate-corpus.ts`'s `--root`/`ASH_CONTEXT_ROOT` resolution).
- Root `package.json`: add `"corpus:backfill-actor": "tsx packages/context-core/scripts/backfill-actor.ts"`.
- Run against `examples/demo-corpus/`; commit the (small — 3 files: `a-0001-brief.md`, `a-0002-proposal.md`, `outcomes.jsonl`) rewritten output.
- Unit test: idempotency (`backfillActor` run twice produces no further diff) + correctness against a small fixture corpus.
- Confirm `pnpm corpus:validate` passes.

**Task 3 — Thread `actor` through `WriteArtifactArgs`/`AppendOutcomeArgs`.**
- `packages/context-core/src/types.ts`: both interfaces gain required (not optional) `actor: Actor` — required in the type forces every call site to update now, matching the "unconditionally required" decision.
- `packages/context-core/src/write-path.ts`: `buildFrontmatter` adds `actor: {type: a.actor.type, id: a.actor.id}`; `renderArtifact` emits an `actor: {type: ..., id: "..."}` line (flow-style, after `generated_by`/`superseded`); the internal `appendOutcome({...})` call passes `actor: args.actor` through.
- `packages/context-core/src/outcomes/append-outcome.ts`: `record` object adds `actor: {type: args.actor.type, id: args.actor.id}` before `note`.
- Update every existing `context-core` test call site (`write-path.test.ts`, `append-outcome.test.ts`, any loader fixtures) to pass an `actor`.

**Task 4 — Fix downstream compile breaks in `packages/skills`/`evals`.**
- `packages/skills/src/types.ts`: import + re-export `Actor` from `context-core`; add `actor?: Actor` to `RunContext`.
- `packages/skills/src/runner.ts`: in the generation+write-grant branch, throw if `!ctx.actor`; pass `actor: ctx.actor` into the internal `writeArtifact` call.
- `evals/runner/run-suite.ts`: `runCallPrepSuite()`'s `RunContext` construction gains `actor: {type:"system", id:"eval-runner"}`.
- Exit criterion: `pnpm typecheck && pnpm test` green repo-wide, zero MCP-package code written yet.

**Task 5 — `call-summary` inbound-read amendment (the gap found above).**
- `packages/skills/src/definitions/call-summary.yaml`: add `context/accounts/*/opportunities/*/inbound/**` to `context_grants.read`.
- `packages/skills/src/impl/call-summary.ts`: branch on `meetingPath.includes("/inbound/")` — call `ctx.loader.readInbound(meetingPath)` + `ctx.loader.extractUntrusted(wrapped)` to get `noteText`, instead of `ctx.loader.read(meetingPath).raw`, when the input path is inbound-shaped. `CallSummaryInput` shape unchanged.
- One-line amendment to spec 005's "Skill contract" section noting this widened grant + the reason (watcher can't function otherwise).
- Unit test: `call-summary` run against a `meetings/**` path (existing behavior, unchanged) and against an `inbound/**` path (new — asserts `readInbound`'s taint registration actually fires).

**Task 6 — Per-opportunity queue in `context-core`.**
- `packages/context-core/src/concurrency/opportunity-queue.ts`: `createOpportunityQueue()` / `opportunityKey(accountSlug, crmId)` — `Map<string, Promise>`-chaining, cross-key independent, one call's rejection doesn't poison the next queued call at the same key.
- Wire into `packages/context-core/src/loader.ts`: `writeArtifact`/`appendOutcome` bindings route through `queue.run(opportunityKey(...), () => ...)`.
- Unit test: `opportunity-queue.test.ts` (ordering, cross-key independence, rejection handling).
- Integration test (the OQ#5 proof obligation): N (~15) simultaneous `loader.writeArtifact`/`appendOutcome` calls against one scratch-corpus opportunity — assert N distinct sequential `a-000N` artifact files (no gaps/dupes), `outcomes.jsonl` has exactly N valid JSON lines, each `actor.id` present exactly once.

**Task 7 — Scaffold `packages/mcp-agentic-sales-hub`.**
- `package.json` (`@agentic-sales-hub/mcp-agentic-sales-hub`, `bin` entry since this runs as a process, deps: `@agentic-sales-hub/context-core`, `@agentic-sales-hub/skills` as `workspace:*`, `@modelcontextprotocol/sdk`), `tsconfig.json` (extends base, project-references to `context-core`/`skills`), `vitest.config.ts` (name: `mcp-agentic-sales-hub`).
- Root `tsconfig.json`: add `{"path": "./packages/mcp-agentic-sales-hub"}` to `references`.
- Root `vitest.workspace.ts`: add the new package's config path.
- `pnpm-workspace.yaml` / root `build` script: no edit needed (both glob `packages/*`).
- `src/index.ts`, `src/server.ts` stubs (McpServer via the SDK's `StdioServerTransport`, zero tools registered yet); smoke test that the server starts.

**Task 8 — `call-prep` MCP tool.**
- `src/tools/call-prep-tool.ts` + `src/tools/shared.ts` (shared loader construction — one `ContextLoader` instance for the process's lifetime; actor input schema).
- Tool input: `{actor, account_slug, opp_id, meeting_context?}` → `runSkill("call-prep", {...}, {loader, scopeParams, actor})`. Persistence already happens inside `runSkill` (call-prep has a write grant) — no separate write call needed here.
- Unit test: actor flows into the persisted artifact's `generated_by`/`actor` fields.

**Task 9 — `call-summary` MCP tool + renderer + taint-check.**
- `src/tools/render-call-summary.ts`: new renderer (`SummaryOutput` → artifact body + flattened citations), colocated with the persisting layer per the `write-findings.ts` precedent (sow-review's renderer lives where its persister lives).
- `src/tools/shared.ts`: `assertNotTainted(loader, ...values)` — calls `loader.isTainted(value)` per value, throws on any match. This is JC#3's in-process equivalent of the Claude-Code `PreToolUse` hook, which does not wrap this separate process.
- `src/tools/call-summary-tool.ts`: `runSkill("call-summary", {meeting_path}, {loader, scopeParams, actor})` → render → `assertNotTainted` → `loader.writeArtifact({kind:"summary", ..., actor})` (kind `"summary"` already in `artifact.json`'s enum).
- Unit tests: positive (actor threading, artifact persisted), negative (a rendered body containing tainted content is refused — `writeArtifact` never called, assert via spy).

**Task 10 — File watcher.**
- `src/watcher.ts`: `createInboundWatcher({loader, repoRoot, debounceMs?})` — `fs.watch(join(repoRoot,"context"), {recursive:true})`, filters to `/inbound/` paths, debounces per-path (default ~400ms) to coalesce multi-event bursts into one trigger, derives `{accountSlug, crmId}` from the path shape.
- Per triggered file: `runSkill("call-summary", {meeting_path: inboundPath}, {loader, scopeParams, actor: {type:"system", id:"file-watcher"}})` (now valid post-Task 5) → render (reuse Task 9's renderer) → `assertNotTainted` → `loader.writeArtifact({..., actor: sentinelActor})`.
- Export `createInboundWatcher` from `src/index.ts` (needed by Task 11's eval suite, driven directly rather than through a real subprocess).
- Wire into `src/server.ts`'s startup: one watcher instance, sharing the server's single `ContextLoader` (required for queue/taint-ledger consistency).
- Unit tests: debounce coalescing, non-opportunity-shaped path rejection, sentinel-actor persistence, a tainted-render negative case (mirrors Task 9's).

**Task 11 — Watcher-triggered eval suite + full regression.**
- `evals/cases/watcher-trigger/` fixture (a transcript-shaped file to drop into a scratch corpus's `inbound/**`).
- `evals/runner/run-suite.ts`: add `"watcher-trigger"` to `SuiteName`/`ALL_SUITES`; `runWatcherTriggerSuite()` builds a scratch corpus + loader + `createInboundWatcher`, copies the fixture into `inbound/**`, awaits the trigger (poll for the new artifact, bounded by debounce+margin), asserts the artifact's and outcome's `actor` both equal `{type:"system", id:"file-watcher"}`.
- Confirm `sow-review`, `find-evidence`, `call-summary`, `call-prep` suites still pass unchanged; add the "call-summary once via an MCP tool call" variant the spec's Eval-impact section calls for.
- Full `pnpm eval --suite all --write-results`; commit the new `evals/results/<date>-<sha>.json`; confirm no net regression.

**Task 12 — Docs/CI.**
- `context/schema/README.md`: schema-version history note (1.0.0 → 1.1.0, `actor` addition).
- `CLAUDE.md`: current-state bullet for the new package (keep under the ~150-line budget).
- `HANDOFF.md` update.
- Confirm CI workflows need no new secrets/steps (both `packages/*`-globbing build/test steps auto-include the new package).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green after every task, not just at the end.
- `pnpm corpus:validate` green from Task 2 onward.
- `pnpm eval --suite all --write-results` — all existing gates still pass (`sow-review` blocker recall 1.00, `find-evidence` recall ≥0.90, `call-summary`/`call-prep` citation validity 1.00), no net regression, plus the new `watcher-trigger` suite passing.
- Manually run the MCP server (`node packages/mcp-agentic-sales-hub/dist/server.js` or via its `bin`), drop a fixture file into a scratch corpus's `inbound/**`, confirm an artifact + outcome appear with the sentinel actor within the debounce window, with no tool call made.
- The Task 6 concurrency test is the explicit proof obligation closing spec 005's Open question #5 (queue subsumes `appendOutcome`'s missing write-guard) — must pass before that OQ is considered actually resolved, not just asserted.

## Critical files

- `packages/context-core/src/types.ts`, `write-path.ts`, `loader.ts`, `outcomes/append-outcome.ts` — actor threading + queue wiring
- `packages/skills/src/types.ts`, `runner.ts`, `definitions/call-summary.yaml`, `impl/call-summary.ts` — `RunContext.actor`, and the inbound-read-grant amendment
- `context/schema/artifact.json`, `outcome.json`, `packages/context-core/src/schema/registry.ts` — the `actor` diffs + version bump
- `evals/runner/run-suite.ts` — `runCallPrepSuite()`'s required actor fix + new `runWatcherTriggerSuite()`
- New: `packages/mcp-agentic-sales-hub/**` (server, tools, watcher, opportunity-queue consumer)
