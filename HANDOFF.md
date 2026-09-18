# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-18** (Intent 005 — team steel thread — all 12 plan
tasks implemented, committed, and reviewed on `intent/005-team-steel-thread`.
**Not yet mergeable**: the final full-regression eval run
(`pnpm eval --suite all --write-results`) is blocked on an external Anthropic
API credit-balance issue in this environment — see "Next action" below. WI-2 /
intent 004 (`call-prep` + the write path) **shipped to `main`** via PR #21 —
merged into this branch. Intent 005 inserts ahead of WI-3 (`proposal-draft`)
in the work chain — see "Intent 005" section below).

## Intent 005 — team steel thread (implementation complete, reviewed; eval regression run outstanding)

**Why this exists:** a same-day pivot from single-seller to team/org support
(see `TEAM FOCUS.md`, uncommitted, at repo root — onboarding acceleration,
manager deal support, trend analysis, CS/Product handoff, and a concrete
background-agent case: auto-coaching after every discovery call). Rather than
build out the remaining single-seller skills (`proposal-draft`, corpus
expansion) and discover team-support gaps later, the call was to prove a thin
**steel thread** first: actor identity, safe concurrent writes, and one real
automatic trigger, end-to-end, before adding more skills to a still-single-
seller architecture.

**Scope (tier:2 — schema change + new package + new background-execution
surface):**
- Actor identity added to `artifact.json` / `outcome.json` schemas and the
  `WriteArtifactArgs` / `AppendOutcomeArgs` type surface.
- Single-process mutex/queue serializing `writeArtifact()` / `appendOutcome()`
  against the same opportunity (not distributed/multi-machine git locking —
  explicitly deferred).
- New `packages/mcp-agentic-sales-hub` — one MCP tool wrapping `runSkill()`
  for `call-summary`, a second for `call-prep` (both already-built,
  already-eval-gated skills; no new skill authored).
- A file watcher, running **inside** the MCP server process, on
  `inbound/**` → fires `call-summary` automatically, no human action,
  attributed to a fixed sentinel actor (e.g. `system:file-watcher`).
- Explicitly out of scope: RBAC, cross-org grants, trend-analysis rollups,
  CS/Product read surfaces, any real third-party trigger integration
  (Gong/Zoom/webhooks), skill chaining (`call-summary → call-prep`).

**Filed:** `docs/intent/005-team-steel-thread.md` (issue
[#22](https://github.com/aabbottbos/agentic-sales-hub/issues/22)),
`docs/specs/005-team-steel-thread.md`, and `docs/plans/005-team-steel-thread.md`
— all committed on `intent/005-team-steel-thread`.

**Resolved during spec/plan:**
1. Actor field shape — typed `{type: "human"|"system", id: string}`, required
   (not optional) on `artifact.json`/`outcome.json`. Existing corpus records
   backfilled with a legacy sentinel actor (plan Task 2), no grandfather
   clause on `schema_version` skew.
2. Corpus expansion (§10) stays a separate, later work item — not folded into
   this spec's WI-4 scope.
3. Sequencing vs. WI-3 (`proposal-draft`): 005 ships first — prove the steel
   thread with `call-summary` + `call-prep` before starting `proposal-draft`.
4. `appendOutcome`'s missing write-guard: no standalone fix — the
   per-opportunity mutex/queue this spec builds subsumes it, proven by a
   concurrency test (plan Task 6), not a separate small fix.
5. A real gap found during plan design: `call-summary.yaml`'s read grant
   (`meetings/**` only) can't reach `inbound/**`, which the watcher needs.
   Resolved by widening the grant + a path-shape branch in the impl (plan
   Task 5) — a small, additive amendment to spec 005's Skill contract
   section, not a full contract rewrite.

**All 12 plan tasks are done, committed, and reviewed** (spec compliance +
code quality) as of 2026-09-18: Task 1 `372ae74`, Task 2 `e7e3b9b`, Task 3
`e58e33e`, Task 4 `325fb1d` (plus unrelated lint fix `35a4cf6`), Task 5
`85f9650`, Task 6 `e66f971`, Task 7 `cd35088`, Task 8 `f18cd0c`, Task 9
`3e02d8e`, Task 10 `3ef6710`, Task 11 `d0635dd` + follow-up `57e9be3`, Task 12
(this docs/CI pass). `pnpm typecheck && pnpm test && pnpm build && pnpm lint`
are green throughout.

**Next action — the one open item before this branch can be considered fully
verified and merge-ready:** the plan's Verification section calls for a full
`pnpm eval --suite all --write-results` run and a newly committed
`evals/results/<date>-<sha>.json` showing no net regression (including the new
`watcher-trigger` suite). That run is currently **blocked on an external
Anthropic API credit-balance issue** in this environment — confirmed genuinely
external (a direct `curl` to the Anthropic API reproduces the same failure
outside any of this repo's code), not a bug in the eval harness or the skills.
No new `evals/results/` file has been committed for this branch's work yet.
Before merging this branch: (1) top up the Anthropic API credit balance used
by this environment/`ANTHROPIC_API_KEY`, (2) re-run
`pnpm eval --suite all --write-results` from `intent/005-team-steel-thread`,
(3) commit the resulting `evals/results/<date>-<sha>.json`, confirm
`regression_verdict: PASS` and all hard gates green (`sow-review` blocker
recall 1.00, `find-evidence` recall ≥0.90, `call-summary`/`call-prep` citation
validity 1.00, `watcher-trigger` passing), then proceed to PR/merge. Do not
treat intent 005 as shipped/merged until this step is done.

## The North Star (`docs/AgenticSalesHub_NorthStar_v1.md`, uncommitted)

Governs `Spec_v2.md`, the Adoptability Amendment, and the SDLC Framework —
when a scope question can't be settled in a spec, it's settled here. Not yet
`git add`ed; do that in a normal commit when convenient, no rush.

**Thesis:** sales work should compound because the context substrate — not
the CRM — is the system of record; augmenting existing skills with real org
context doesn't just improve them, it makes new skills possible that weren't
viable before. **Priority order:** (1) a Director+ role — judge everything
else by whether it serves this, (2) the open-source repo as proof-of-earned-
thesis, (3) a managed service, explicitly **deferred, not dead** (trigger:
three outside orgs running it on their own context ask to be hosted).

**Scope resolution — org-wide in the writing, seller-deep in the build.** The
writeup covers the whole revenue org; the working system proves one slice
(the deal spine, five skills + setup skill + the compounding loop) to
evaluated depth. Deferred-by-name in the writing: pipeline inspection (the
strongest candidate — same structured-findings contract as `sow-review`,
first thing after the job search closes), SOW generation, CS handoff, lead
gen/enrichment, dashboards, CRM integration.

**Sequencing inversion — the writeup moves ahead of the build.** This
supersedes Spec v2 §11's Phase 3 placement. Target: publish the thesis
document + a ≤5-min demo video in October, on top of a 60%-built system,
ahead of interview season (Oct–Nov). The build plan (WI chain below) keeps
running underneath it, not blocked by it.

**Three concrete deltas this creates for the amendment/roadmap** (§10):
1. **New work item — the compounding loop.** Outcome-weighted retrieval
   extending `find-evidence`, plus **evidence reuse rate** as a scored, gated
   metric (the primary "did compounding actually happen" number). Not yet
   assigned a WI slot or intent number — needs its own intent before WI-4/WI-5
   land, since reuse rate needs the corpus requirement below to measure
   anything.
2. **WI-4 (corpus expansion) gains a hard requirement**: at least two of the
   added opportunities must close (won or lost) with artifacts and
   `outcomes.jsonl` records populated — not just more meeting notes. Update
   intent 006 to carry this before it's written.
3. **Non-negotiable eval gates are unchanged** (blocker recall 1.00, citation
   validity 1.00, retrieval recall ≥ 0.90, generation rubric ≥ 4.0/5, no net
   regression) — the North Star treats these as the proof layer, not in
   tension with the business goal. Decision rule: never weaken a gate to hit
   a deadline.

**Two-layer packaging is a design constraint, not a nice-to-have** — a VP of
Sales must follow the demo in 5 minutes (revenue language, deal outcomes, a
number); a technical evaluator verifies it's real in 20 (evals, provenance,
context spec, commit history). The repo today is all proof layer — closing
that gap (README rewrite, demo video) is itself in-scope work, likely riding
on WI-5's README rewrite rather than a separate item.

**Not yet reconciled with intent 005:** the North Star's five-skills-plus-
compounding-loop framing predates today's team-focus pivot. Team support
(multi-user, background execution) isn't named in the North Star's deltas
above — flag this gap when the North Star is next revised, so the document
and the WI chain don't silently diverge.

## Where we are

**Phase 0 (Context Substrate + Eval Harness) is done and merged to `main`**
(`d18595e..d263daa`, 11 commits, plan `docs/plans/001-context-substrate-eval-harness.md`).
**The SDLC loop is live and exercised** — branch protection, labels, and the
`evals.yml` PR-comment path all verified through real PRs (#3, #5).

**The Adoptability Amendment is in force** (`docs/AgenticSalesHub_Spec_Adoptability-Amendment_v1.md`,
2026-09-08). It adds a co-equal objective — an outside org clones, populates its
own context, and gets useful output without rework — and reshapes the roadmap
into a strict dependency chain: **WI-0 → WI-1 → WI-2 → WI-3 → WI-4 → WI-5**, each
its own intent → spec → plan → PR. Intent 002 (`call-summary`) is explicitly
carved out and proceeds in parallel. Intent 005 (this session) now inserts
into that chain ahead of WI-3 — see "The work chain" below.

**WI-0 (rename to Agentic Sales Hub) is done and merged** (`5942c0d`, PR #9).
`deal-desk`/`DEAL_DESK_*`/`DealDesk*` → `agentic-sales-hub`/`ASH_*`/`AshError`
everywhere except the naming-decision record in `Spec_v2.md` §1.5 and the
Amendment §3. Env var `DEAL_DESK_TAINT_LEDGER` → `ASH_TAINT_LEDGER` landed in
both the quarantine hook and the injection harness (`injection: PASS` confirms).
Schema `$id` base is now `https://agentic-sales-hub.dev/schema/`.

- `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm lint` — all green as of WI-2's merge (PR #21, `98a6e74`) into `main`.
- `pnpm eval --suite all` — all gates pass as of `evals/results/2026-09-11-59e5e45.json` (WI-2's merged result, includes `call-prep` for the first time).
- `pnpm corpus:validate` / `pnpm check:no-real-data` — clean.

All six Phase 0 intent success criteria are met.

## What's built (and where)

| Area | Path | State |
|---|---|---|
| Context loader / security boundary | `packages/context-core/` | done — `createLoader()` is the entrypoint (`src/loader.ts`). `writeArtifact()`/`appendOutcome()` on `main` today lack actor identity and (for `appendOutcome`) any collision guard — intent 005's target. |
| Published context spec | `context/schema/` | done — 17 JSON Schemas (draft 2020-12) on `main`; `brief-output.json` lands with WI-2. `context/schema/README.md` is the path→schema table. |
| Synthetic corpus | `examples/demo-corpus/` | done — "Minimal + 1 opportunity" (Meridian Grid / Acme Logistics). Fictional; see `CORPUS.md`. |
| Skills | `packages/skills/` | `find-evidence` + `sow-review` deterministic (ADR `docs/decisions/0001`); `call-summary` and `call-prep` LLM-backed, both merged to `main`. `call-prep` is the first skill with a write grant. |
| Eval harness | `evals/` | done on `main`, including `runCallPrepSuite()` (mutates a scratch corpus copy, not `examples/demo-corpus/` directly). |
| Enforcement | `.claude/hooks/`, `.claude/settings.json` | done — quarantine-inbound, protect-paths (PreToolUse); format-on-write (PostToolUse). |
| CI | `.github/workflows/` | done — `ci.yml`, `evals.yml`, `claude.yml`, `claude-review.yml`. |
| Review policy | `REVIEW.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS` | done |
| MCP server | `packages/mcp-agentic-sales-hub` | **done** (plan `docs/plans/005-team-steel-thread.md`, Tasks 7–10) — two tools (`call-prep`, `call-summary`) wrapping `runSkill()`, plus an in-process file watcher on `inbound/**` auto-triggering `call-summary` under sentinel actor `system:file-watcher`. Reviewed; full-corpus eval verification still outstanding (see "Next action"). |

## Key mechanics to know

- **`readInbound(path)` is the only way to read an `inbound/**` file.** It verifies
  `source_hash`, wraps the body in untrusted-content delimiters, and appends
  shingles to the taint ledger. `.claude/settings.json` denies raw `Read` on
  `inbound/**`.
- **The quarantine hook** (`.claude/hooks/quarantine-inbound.ts`) reads
  `.claude/.taint-ledger.jsonl` (or `$ASH_TAINT_LEDGER`) and blocks any
  Write/Edit/Bash whose arg text matches an ingested inbound doc.
- **Canonical opportunity id shape**: Salesforce-style 18-char,
  `^006[A-Za-z0-9]{12}[A-Z]{3}$` — the corpus uses `006Ax0000GkLmNpQAA`. The dir
  name must equal `crm_id`; `corpus:validate` cross-checks.
- **`.claude/skills/<id>/SKILL.md` is generated** from the YAML definitions by
  `pnpm skills:sync`. CI runs `pnpm skills:sync:check` — a drift fails the build.
- **`writeArtifact()` mints artifact ids via `flag: "wx"`** (collision-safe by
  construction); **`appendOutcome()`'s `appendFile` has no equivalent guard**
  — discovered during intent 005's investigation. **Fixed (plan 005 Task 6,
  `e66f971`):** both now route through a per-opportunity in-process queue
  wired into `context-core`'s `createLoader()`
  (`src/concurrency/opportunity-queue.ts`), proven by a concurrency test
  rather than a standalone `flag`-style fix (spec 005 OQ #5 resolved — the
  queue subsumes this). Scoped to one loader instance's lifetime — neither
  function does anything at the git layer (no commit, no lock), so two
  *separate processes* writing to the same opportunity can still interleave;
  that remains explicitly out of scope (single-process mutex only, per spec).
- **`resolveContextRoot()` precedence**: `opts.root` → `ASH_CONTEXT_ROOT` →
  `ash.config.json` `contextRoot` → `./context`. An empty `context/` is valid.

## Deviations from the spec (already accepted; flag if revisiting)

- **D5 — deterministic skills** in Phase 0, not LLM-backed. ADR `docs/decisions/0001`.
- `finding.json` `suggested_redline` required for blocker/major, optional for minor.
- `find-evidence` read grant excludes `outcomes.jsonl`.
- Node `engines` allows 24+ for local dev; `.nvmrc` + CI pin 22.
- `docs/intent/` is singular (repo convention); the SDLC doc says `docs/intents/`.

## Open follow-ups

1. **`night-shift.yml` + the detector** — framework §7, deferred to Week 3+.
   Not started.
2. **Blocking decisions before the first outside clone** (amendment §12): repo
   public-from-day-one (v2 open decision #1) and the license (#2). Needed before
   WI-5.
3. **HANDOFF vs. amendment numbering** — the amendment's WI chain (intent
   003–007) is authoritative, now reordered by intent 005 — see "The work
   chain" below.
4. **North Star not yet committed** — `docs/AgenticSalesHub_NorthStar_v1.md`
   is on disk, untracked. Commit it (plain T0 docs commit) before or alongside
   the next WI so it's governing in-repo, not just on disk. Also needs
   reconciling with intent 005's team-focus pivot (see North Star section
   above).
5. **`TEAM FOCUS.md` not yet committed** — on disk at repo root, untracked.
   The source document for intent 005's pivot. Commit it alongside the North
   Star, or fold its content into the North Star directly, so the team-focus
   rationale is governing in-repo rather than a loose file.
6. **The compounding loop has no intent number yet.** North Star §10 names it
   as a new work item (outcome-weighted retrieval + evidence reuse rate as a
   gated metric) but doesn't slot it into the WI chain, and doesn't yet
   account for intent 005 either.
7. **WI-4's intent (007, not yet written) — resolved not to carry the
   closed-deal requirement bundled with intent 005.** Corpus expansion (§10)
   stays a separate, later work item, per spec 005's resolved OQ #2 — it does
   not fold into 005's MCP-server scope. The ≥2-closed-opportunities
   requirement itself is still real and still belongs on whatever intent
   ends up covering corpus expansion.
8. **Two-layer packaging / demo video** — not scoped as a WI yet. Likely rides
   on WI-5's README rewrite plus a standalone demo video, needed before
   October per the North Star's sequencing inversion (§7).
9. **Blocking generation-quality gate — deliberately deferred, not closed**
   (spec 004 Judgment call #6, ratified at spec review 2026-09-11). Both
   `call-summary` and `call-prep` ship with only citation validity as a
   blocking gate; the rubric is advisory/tracked only. Revisit once either a
   stabler judge setup exists or the golden set is large enough that one
   case can't dominate the aggregate. Flagged for `proposal-draft` (WI-3)
   planning time — still applies now that WI-3 sits behind intent 005 in the
   chain.
10. **WI-2 merged to `main` via PR #21 (`98a6e74`), 2026-09-17.** No longer a
    blocker — intent 005's implementation (plan `docs/plans/005-team-steel-thread.md`)
    is now complete on top of it (all 12 tasks done, see "Intent 005" section).
    The `intent/005-team-steel-thread` branch was cut before this merge and
    needed its own catch-up merge (`7614e2e`) before Task 1 could start —
    worth checking `git merge-base HEAD origin/main` on any long-lived
    feature branch before assuming it has the latest merged work.
11. **Intent 005's final eval regression run is blocked, not skipped** — an
    external Anthropic API credit-balance issue in this environment, verified
    via direct `curl` to the Anthropic API outside this repo's code. No
    `evals/results/` file has been committed for this branch yet. See the
    "Next action" section at the top of this file for the exact 3-step
    unblock sequence (top up credits → `pnpm eval --suite all
    --write-results` → commit the result). This is the one thing standing
    between "implementation complete and reviewed" and "mergeable."
12. **Taint-ledger short-phrase matching is a genuine, if narrow, gap** —
    surfaced during Task 9's review (`packages/context-core/src/quarantine/taint.ts`,
    the `match()` function's case 3). The ledger catches long (8-word)
    shingle overlaps and whole-shingle substrings reliably, but its
    3–7-word "short lifted phrase" branch does plain substring containment
    against normalized shingles — common short phrases risk false positives,
    and a phrase reworded just enough to cross shingle boundaries risks a
    false negative. Pre-existing (not introduced by intent 005 — Task 9's
    `assertNotTainted` just calls the existing `match()`), and not a blocker
    for the steel thread's own scope, but worth a dedicated look (e.g.
    stemming/normalization tuning, or a length-scaled threshold) next time
    anyone is in the quarantine/taint code, since it's the one hook standing
    between an untrusted `inbound/**` document and a laundered write into
    `context/accounts/**`.

## The work chain (amendment §6–§11, reordered by intent 005)

Strict dependency order. Each WI is its own committed intent → spec → plan → PR.
**Never weaken an eval gate to make a WI pass.**

| WI | What | Tier | Intent | State |
|---|---|---|---|---|
| **WI-0** | Rename to Agentic Sales Hub | T0 | — | **done** (PR #9) |
| **WI-1** | Tenancy seam — `config.ts` + `resolveContextRoot()`; `git mv context/ → examples/demo-corpus/`; `ash.config.json`; `check:context-empty` | T2 | 003 | **done** (PR #17) |
| **WI-2** | `call-prep` + the write path — `writeArtifact()` / `appendOutcome()`; `brief-output.json`, `outcome-record.json`; protect-paths denies direct writes to `**/artifacts/**` | T2 | 004 | **done** (PR #21, `98a6e74`) |
| **Team steel thread** | Actor identity; per-opportunity write queue; `packages/mcp-agentic-sales-hub` (2 tools: `call-summary`, `call-prep`); in-process file watcher on `inbound/**` → auto-triggers `call-summary` | T2 | **005** | **implementation complete, all 12 tasks done and reviewed** (`docs/plans/005-team-steel-thread.md`). Not yet merged — final `pnpm eval --suite all --write-results` regression run is outstanding, blocked on an external Anthropic API credit-balance issue (see "Next action" above). Inserted ahead of WI-3. |
| **WI-3** | `proposal-draft` — built-in default structure; **new hard gate: no uncited price/discount/delivery commitment** | T2 | 006 (renumbered from 005) | not started |
| **WI-4** | Remaining `packages/mcp-agentic-sales-hub` scope (beyond the steel thread) + §10 corpus expansion (3 more opportunities, ~12 meeting notes) | T2 | 007 (renumbered from 006) | not started — scope may shrink or merge with intent 005, per open question 2 |
| **WI-5** | Adoption layer — `/onboard` setup skill; 3 knob schemas (`voice`/`playbook`/`output-template`); `skills:sync` → `skills:compile` w/ provenance header; `routeIntake()` + its default-deny eval case; `pnpm init:context`; README rewrite (adoption path first) | T2 | 008 (renumbered from 007) | not started |

**Note on renumbering:** intent doc numbers are assigned at filing time and
are not renumbered after the fact (005 is permanently "team steel thread").
The **intent column above reflects that** — WI-3/4/5's doc numbers shift down
by one from what earlier HANDOFF revisions said, since 005 was claimed today.
Confirm actual intent numbers against `docs/intent/` before writing new specs;
this table is a planning aid, not the source of truth for filenames.

**WI-1 must land before WI-4/steel-thread** — done, satisfied. **WI-2 must
land before the steel thread's spec work begins** — done, satisfied (PR #21).

### Shared contracts to read before touching any WI (amendment §5)

- **Context root** — `resolveContextRoot()` precedence: `opts.root` → `ASH_CONTEXT_ROOT`
  → `ash.config.json` `contextRoot` → `./context`. An empty `context/` is a valid
  state, not an error — the loader returns an empty tree.
- **Three customization knobs** (all optional markdown+frontmatter, new schemas):
  `context/org/voice.md`, `playbook.md`, `templates/<kind>.md`. Plus a capped
  escape hatch: `context/org/skill-overrides/<skill-id>.md`, ≤ 2,000 chars, CI
  fails if over.
- **Write path** — `writeArtifact()` mints the id, validates against the kind's
  output schema + org template, opens an `unused` outcome. `appendOutcome()` is
  append-only. `routeIntake()` is a **default-deny trust boundary**: confidence
  < 0.85 or `counterparty_document`/`unknown` → `inbound/` quarantine; only
  `meeting_note` ≥ 0.85 → `meetings/`; `org_material` never auto-writes canonical.

## Intent 002 — call-summary — SHIPPED (PR #13, `b135b08`)

The first LLM-backed generation skill. All 15 plan tasks done; intent + spec +
plan + impl all merged to `main`. Issue #7 stays open as the Phase-1 umbrella.

**Key outcomes:**
- `SkillImpl` seam held — `skill-def.schema.json`, `runSkill` signature, and
  `packages/context-core` all unchanged at merge.
- `packages/skills/src/impl/{llm,summary-schema,call-summary,call-summary.prompt}.ts`
  — `@anthropic-ai/sdk ~0.124.0` behind the one `complete()` seam.
- `context/schema/summary-output.json` — output-contract schema.
- `evals/scorers/generation.ts` + `evals/judge/` + `runGenerationSuite()`.

**Ratified spec amendments (docs/specs/002 §"Build-stage amendments"):**
- **A1** — `citation_validity = 1.00` is the ONE hard blocking gate for
  `call-summary` v1. `rubric_aggregate` and `commitment_recall` are ADVISORY —
  a single judge is too noisy, token-overlap recall too literal. See
  `evals/judge/README.md` + spec 002 amendment A1.
- **A2** — a citation is `{path, quote, span}`: the model returns a verbatim
  `quote`, the skill computes `span`.

**`ANTHROPIC_API_KEY` is set as a repo secret** (Actions). Locally it lives in
`.anthropic-key` (gitignored) or `.env.local` (also gitignored). Must be
workspace-scoped. `source .anthropic-key` doesn't work inside a git-worktree-
isolated session — use
`pnpm exec tsx --env-file=.anthropic-key evals/runner/cli.ts --suite all --write-results`
instead.

Baseline eval result: `evals/results/2026-09-10-0932036.json` (call-summary
pre-WI-1). WI-1's post-move baseline: `evals/results/2026-09-11-f82c7a7.json`
(all suites, `regression_verdict: PASS`) — **this is the latest result
committed on `main`.**

## WI-1 — tenancy seam — SHIPPED (PR #17, `d6c6329`)

Makes the context root configurable and moves the demo corpus out of `context/`.

**Key outcomes:**
- `packages/context-core/src/config.ts` — `resolveContextRoot(opts?)`,
  precedence `opts.root` → `ASH_CONTEXT_ROOT` → `ash.config.json`
  `contextRoot` → `./context`.
- `packages/context-core/src/fs/resolve-path.ts` — `resolveContextPath()` /
  `toLogicalContextPath()`, the shared logical-to-physical path helper.
  Throws `ScopeViolationError` on a malformed logical path.
- `git mv context/{org,demand-gen,legal,accounts} → examples/demo-corpus/`.
  History preserved; `corpus.lock.json` regenerated, byte-identical hashes.
- New `pnpm check:context-empty` — blocking CI guard.
- `.claude/hooks/protect-paths.ts` protects both `context/**` and
  `examples/demo-corpus/**`.

**Deviation from the spec's explicit function list (not a defect, a scope
correction):** `findings/write-findings.ts`, `outcomes/append-outcome.ts`, and
one direct read in `evals/runner/run-suite.ts` had the identical `repoRoot`
bug as the spec's named functions. Fixed in the same PR.

## WI-2 — call-prep + the write path — SHIPPED (PR #21, `98a6e74`)

All 15 plan tasks done; intent doc (PR #20, `d1bb307`) and implementation
(PR #21) both merged to `main`, 2026-09-17.

The second LLM-backed generation skill, and the first skill with a write
grant — `writeArtifact()` persists its output as a new artifact and opens an
`unused` outcome record automatically.

**Key outcomes:**
- `packages/skills/src/impl/{brief-schema,call-prep,call-prep.prompt}.ts` —
  wide read grant (`context/org/**`, `context/demand-gen/**` beyond the
  opportunity's own scope), same `impl/llm.ts` seam as `call-summary`.
- `context/schema/brief-output.json` — output-contract schema for
  `goal` / `what_we_know` / `talking_points` / `risks`, each entry carrying a
  resolvable citation.
- `packages/context-core/src/types.ts` gains **additive-only** exports —
  `ArtifactCitationInput`, `WriteArtifactArgs`, `WriteArtifactResult` — for
  `writeArtifact()`. This is the function intent 005's serialization task
  wraps.
- `runSkill` hardened: a write-grant skill with `requires_citations: true`
  now has that invariant enforced at the runner.
- `evals/runner/run-suite.ts`'s `runCallPrepSuite()` — mutates a fresh
  `mkdtemp` + `cp` scratch copy of `examples/demo-corpus/`, never the
  committed corpus directly.

**Ratified spec amendment (spec 004 Judgment call #6):** `citation_validity
= 1.00` is the one hard blocking gate for `call-prep`; `rubric_aggregate` is
advisory, same rationale as A1. 3 live calibration runs: citation validity
1.00 every run.

**Next action:** none — superseded by intent 005's implementation, now
underway on top of this (see "Team steel thread" in the work chain above and
`docs/plans/005-team-steel-thread.md`).
