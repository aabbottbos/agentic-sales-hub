# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-11** (WI-1 / intent 003 tenancy seam **shipped** — PR #17
merged to `main`, `d6c6329`. `docs/AgenticSalesHub_NorthStar_v1.md` landed the
same day — governs all three other docs, not yet committed. Next: WI-2, intent
004 — `call-prep` + the write path, with the North Star's deltas folded in
first — see "The North Star" section below).

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
carved out and proceeds in parallel.

**WI-0 (rename to Agentic Sales Hub) is done and merged** (`5942c0d`, PR #9).
`deal-desk`/`DEAL_DESK_*`/`DealDesk*` → `agentic-sales-hub`/`ASH_*`/`AshError`
everywhere except the naming-decision record in `Spec_v2.md` §1.5 and the
Amendment §3. Env var `DEAL_DESK_TAINT_LEDGER` → `ASH_TAINT_LEDGER` landed in
both the quarantine hook and the injection harness (`injection: PASS` confirms).
Schema `$id` base is now `https://agentic-sales-hub.dev/schema/`.

**Phase 1 is in progress** — intent 002 **merged** (PR #10, squash `a78e2d0`);
spec 002 **cold-reviewed and approved** (comment on PR #11, `c7c8540`) — one
edit: OQ5 resolved plan-avoids-`SCHEMA_TYPES` (generation branch validates the
raw `summary-output.json` file, no `context-core` change). **PR #11 is ready to
merge** (`spec/002-call-summary-generation-path`); after merge → fresh branch off
`main` → plan mode → `docs/plans/002-…`. See the last section.

- `pnpm install && pnpm typecheck && pnpm test && pnpm build && pnpm lint` — all green.
- **122 unit tests pass.**
- `pnpm eval --suite all` — all gates pass:
  - `sow-review` blocker_recall **1.0**, precision **1.0**, citation_validity **1.0**
  - `find-evidence` recall **1.0**, citation_validity **1.0**
  - injection case: quarantine hook blocks the induced write (`injection: PASS`)
- `pnpm corpus:validate` — 28 files, 0 errors. `pnpm check:no-real-data` — OK.
- First eval result committed: `evals/results/2026-09-07-434b594.json`.

All six intent success criteria are met.

## What's built (and where)

| Area | Path | State |
|---|---|---|
| Context loader / security boundary | `packages/context-core/` | done — 92 tests. `createLoader()` is the entrypoint (`src/loader.ts`). |
| Published context spec | `context/schema/` | done — 17 JSON Schemas (draft 2020-12). `context/schema/README.md` is the path→schema table. |
| Synthetic corpus | `examples/demo-corpus/` | done — "Minimal + 1 opportunity" (Meridian Grid / Acme Logistics). Fictional; see `CORPUS.md`. Moved from `context/` by WI-1 (`git mv`, history preserved); `context/` now holds only `schema/`, `templates/`, `.gitkeep`. |
| Skills | `packages/skills/` | done — `find-evidence` + `sow-review`, **deterministic** (ADR `docs/decisions/0001`). YAML defs in `src/definitions/`, impls in `src/impl/`, `runSkill` in `src/runner.ts`. |
| Eval harness | `evals/` | done — scorers, cases, `runner/cli.ts` (`pnpm eval`), `runner/injection-harness.ts`. |
| Enforcement | `.claude/hooks/`, `.claude/settings.json` | done — quarantine-inbound, protect-paths (PreToolUse); format-on-write (PostToolUse). |
| CI | `.github/workflows/` | done — `ci.yml`, `evals.yml`, `claude.yml`, `claude-review.yml`. Verified working on PR #2. |
| Review policy | `REVIEW.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS` | done |

## Key mechanics to know

- **`readInbound(path)` is the only way to read an `inbound/**` file.** It verifies
  `source_hash`, wraps the body in untrusted-content delimiters, and appends
  shingles to the taint ledger. `.claude/settings.json` denies raw `Read` on
  `inbound/**`.
- **The quarantine hook** (`.claude/hooks/quarantine-inbound.ts`) reads
  `.claude/.taint-ledger.jsonl` (or `$ASH_TAINT_LEDGER`) and blocks any
  Write/Edit/Bash whose arg text matches an ingested inbound doc. The eval
  injection-harness sets `ASH_TAINT_LEDGER` to
  `.claude/.taint-ledger.eval.jsonl` so the hook sees the ledger the harness
  populated. Both ledger files are gitignored (`.claude/.taint-ledger*.jsonl`).
- **`sow-review` matcher**: whitespace-normalizes the extracted inbound body
  (redlines wrap mid-phrase), compiles each clause's `unacceptable_patterns` as
  `RegExp(p, "i")`, maps match offsets back to raw body offsets, and emits one
  Finding per distinct clause+locator (highest severity wins).
- **Canonical opportunity id shape**: Salesforce-style 18-char,
  `^006[A-Za-z0-9]{12}[A-Z]{3}$` — the corpus uses `006Ax0000GkLmNpQAA`. The dir
  name must equal `crm_id`; `corpus:validate` cross-checks.
- **`.claude/skills/<id>/SKILL.md` is generated** from the YAML definitions by
  `pnpm skills:sync`. CI runs `pnpm skills:sync:check` — a drift fails the build.
  Do not hand-edit those two SKILL.md files (`write-intent` / `write-spec` are
  hand-authored and untouched).

## Deviations from the spec (already accepted; flag if revisiting)

- **D5 — deterministic skills** in Phase 0, not LLM-backed. ADR `docs/decisions/0001`.
  Phase 1 swaps an LLM-backed impl into `packages/skills/src/impl/` behind the
  same contract. Spec 002 resolves the how: `@anthropic-ai/sdk` direct behind a
  single seam function (`impl/llm.ts`), **not** the Agent SDK — model portability
  is an explicit v1 non-goal.
- `finding.json` `suggested_redline` required for blocker/major, optional for minor.
- `find-evidence` read grant excludes `outcomes.jsonl`.
- Node `engines` allows 24+ for local dev; `.nvmrc` + CI pin 22.
- `docs/intent/` is singular (repo convention); the SDLC doc says `docs/intents/`.

## Done since Phase 0

- **Intent 002 — call-summary generation path** (PR #10, squash `a78e2d0`).
  tier:2 intent committed; issue #7 is the Phase 1 umbrella. Spec follow-up is
  PR #11 (open).
- **WI-0 — rename to Agentic Sales Hub** (PR #9, squash `5942c0d`). Mechanical,
  T0. See "Where we are" above for the details. `rg -i "deal.?desk"` now hits
  only the two exempt decision-record docs.
- **Branch protection on `main`** — ruleset active: require PR, require `verify` +
  `gitleaks`, block force-push, linear history. Direct pushes to `main` are
  rejected (confirmed — the `PR-LOOP.md` commit itself bounced and went via PR #3).
- **Labels** — `tier:0/1/2`, `intent`, `agent-ready`, `overnight`,
  `eval-regression`, `human-only` all created.
- **`PR-LOOP.md`** — step-by-step for taking a change through the loop (PR #3).
- **`evals/golden/README.md` + `corpus.lock.json`** — added via PR #5, plus
  `evals/runner/lock-corpus.ts` and `pnpm eval:lock` (regenerates the lock;
  28 files). That PR also fixed a real `evals.yml` bug: `pnpm eval --json > file`
  captured pnpm's lifecycle banner and broke `JSON.parse`; `cli.ts` now has
  `--json-out <path>` and the workflow uses it. **The eval comparison comment
  posts correctly on PRs** (verified on #5).

## Open follow-ups

1. **`night-shift.yml` + the detector** — framework §7, deferred to Week 3+.
   Not started.
2. **Blocking decisions before the first outside clone** (amendment §12): repo
   public-from-day-one (v2 open decision #1) and the license (#2). Needed before
   WI-5.
3. **HANDOFF vs. amendment numbering** — resolved: the amendment's WI chain
   (intent 003–007) is authoritative. Intent 002 (`call-summary`) shipped
   separately (PR #13). WI-1 / intent 003 (tenancy seam) shipped PR #17.
   Next up: **WI-2 / intent 004** — `call-prep` + the write path.
4. **North Star not yet committed** — `docs/AgenticSalesHub_NorthStar_v1.md`
   is on disk, untracked. Commit it (plain T0 docs commit) before or alongside
   the next WI so it's governing in-repo, not just on disk.
5. **The compounding loop has no intent number yet.** North Star §10 names it
   as a new work item (outcome-weighted retrieval + evidence reuse rate as a
   gated metric) but doesn't slot it into the WI-2..WI-5 chain. Needs a
   decision: its own WI between WI-3 and WI-4, or folded into WI-4 alongside
   the corpus-expansion closed-deal requirement (#6 below) since reuse rate
   needs that same corpus data to compute anything.
6. **WI-4's intent (006, not yet written) must carry the closed-deal
   requirement**: ≥2 of the added opportunities close (won/lost) with
   artifacts + `outcomes.jsonl` populated, not just more meeting notes. Flag
   this at intent-writing time, not spec time — it changes the corpus design.
7. **Two-layer packaging / demo video** — not scoped as a WI yet. Likely rides
   on WI-5's README rewrite ("adoption path first") plus a standalone demo
   video, needed before October per the North Star's sequencing inversion
   (§7). Worth a T1 plan of its own once WI-4 is in flight, so it isn't a
   December scramble.
8. **Blocking generation-quality gate — deliberately deferred, not closed**
   (spec 004 Judgment call #6, ratified at spec review 2026-09-11). Both
   `call-summary` (intent 002 amendment A1) and now `call-prep` ship with
   only citation validity as a blocking gate; the rubric (≥ 4.0/5 target) and
   any recall-style scorer are advisory/tracked only, because the same-judge-
   judging-same-family-output noise A1 documented made a blocking rubric
   unreliable. Revisit once either a stabler judge setup exists (more
   attempts + a calibrated threshold, an ensemble, or a non-token-overlap
   claim matcher) or the golden set is large enough that one case can't
   dominate the aggregate. Not itself a WI yet — surface at `proposal-draft`
   (WI-3 / intent 005) planning time, since a third generation skill is
   exactly when "no generation skill has ever had a blocking quality gate"
   becomes harder to defend as still provisional.

## The work chain (amendment §6–§11)

Strict dependency order. Each WI is its own committed intent → spec → plan → PR.
**Never weaken an eval gate to make a WI pass.**

| WI | What | Tier | Intent | State |
|---|---|---|---|---|
| **WI-0** | Rename to Agentic Sales Hub | T0 | — | **done** (PR #9) |
| **WI-1** | Tenancy seam — `config.ts` + `resolveContextRoot()`; `git mv context/ → examples/demo-corpus/`; `ash.config.json`; `check:context-empty` | T2 | 003 | **done** (PR #17) |
| **WI-2** | `call-prep` + the write path — `writeArtifact()` / `appendOutcome()`; `brief-output.json`, `outcome-record.json`; protect-paths denies direct writes to `**/artifacts/**` | T2 | 004 | not started |
| **WI-3** | `proposal-draft` — built-in default structure; **new hard gate: no uncited price/discount/delivery commitment** | T2 | 005 | not started |
| **WI-4** | `packages/mcp-agentic-sales-hub` + §10 corpus expansion (3 more opportunities, ~12 meeting notes) | T2 | 006 | not started |
| **WI-5** | Adoption layer — `/onboard` setup skill; 3 knob schemas (`voice`/`playbook`/`output-template`); `skills:sync` → `skills:compile` w/ provenance header; `routeIntake()` + its default-deny eval case; `pnpm init:context`; README rewrite (adoption path first) | T2 | 007 | not started |

**WI-1 must land before WI-4** or the MCP server bakes in a hardcoded context root.

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
plan + impl all merged to `main`. Issue #7 stays open as the Phase-1 umbrella
(`call-prep`, `proposal-draft`, MCP server still to come).

**Key outcomes:**
- `SkillImpl` seam held — `skill-def.schema.json`, `runSkill` signature, and
  `packages/context-core` all unchanged (`git diff` was empty for each at merge).
- `packages/skills/src/impl/{llm,summary-schema,call-summary,call-summary.prompt}.ts`
  — `@anthropic-ai/sdk ~0.124.0` behind the one `complete()` seam.
- `context/schema/summary-output.json` — output-contract schema, auto-discovered
  by `loadSchemas`, validated in-package (no `SCHEMA_TYPES` / `context-core` change).
- `evals/scorers/generation.ts` + `evals/judge/` + `runGenerationSuite()`.

**Ratified spec amendments (docs/specs/002 §"Build-stage amendments"):**
- **A1** — for `call-summary` v1, `citation_validity = 1.00` is the ONE hard
  blocking gate (deterministic, resolve-only, stable every run).
  `rubric_aggregate` (single `claude-sonnet-5` judge swings 2.5–4.25 on identical
  input) and `commitment_recall` (token-overlap can't bridge a valid paraphrase)
  are ADVISORY — computed, printed with targets, regression-tracked-by-hand only
  (dropped from `compare.ts` PRIMARY so they don't trigger build-failing
  regressions). Revises OQ2 + the generation eval class.
- **A2** — a citation is `{path, quote, span}`: the model returns a verbatim
  `quote`, the skill computes `span` (claude-sonnet-5 cannot produce char
  offsets). Resolves OQ7. `quote` is required in the schema + `SummaryOutput` type.

**Other build-forced fixes** (all merged): `complete()` sends no `temperature`
(deprecated on `claude-sonnet-5`) and passes `thinking: { type: "disabled" }` (the
model otherwise returns no text); it retries transient API errors (429/5xx) 2×;
`call-summary.ts` retries the whole generate→parse→validate cycle 3× (one flaky
generation must not fail the suite); `scoreRubric` degrades to `unavailable`
instead of throwing; `resolveCitationSpan` has a 4-tier quote matcher;
`evals.yml` compare step no-ops when `pnpm eval` produced no report.

**`ANTHROPIC_API_KEY` is set as a repo secret** (Actions). Locally it lives in
`.anthropic-key` (gitignored) or `.env.local` (also gitignored, via `.env.*`) —
before any `pnpm eval` hitting `--suite call-summary` or `all`:
- **The key must be workspace-scoped.** A key not bound to a workspace gets
  `400: This API key is not scoped to a workspace...` from every `call-summary`
  request. Generate one at console.anthropic.com → Settings → API Keys.
- **`source .anthropic-key` doesn't work inside a git-worktree-isolated
  session** — the harness blocks `source`/`export` there (can't statically
  verify the sourced content isn't a git command). Use
  `pnpm exec tsx --env-file=.anthropic-key evals/runner/cli.ts --suite all --write-results`
  instead (Node 22+'s native `--env-file`, threaded through `tsx`). Outside a
  worktree, `source .anthropic-key && pnpm eval --suite all` still works fine.

Baseline eval result: `evals/results/2026-09-10-0932036.json` (call-summary
pre-WI-1). WI-1's post-move baseline: `evals/results/2026-09-11-f82c7a7.json`
(all suites, `regression_verdict: PASS`).

## WI-1 — tenancy seam — SHIPPED (PR #17, `d6c6329`)

Makes the context root configurable and moves the demo corpus out of `context/`.
Intent + spec + plan (`docs/intent/003`, `docs/specs/003`, `docs/plans/003`)
merged first as PR #16 (Design gate, cold-reviewed); implementation followed as
PR #17 via `superpowers:subagent-driven-development` — 9 sequenced tasks, each
with independent spec-compliance + code-quality review.

**Key outcomes:**
- `packages/context-core/src/config.ts` — `resolveContextRoot(opts?: { root?,
  cwd? })`, sync, precedence `opts.root` → `ASH_CONTEXT_ROOT` → `ash.config.json`
  `contextRoot` → `./context`. `AshConfig` fully typed (`contextRoot`,
  `org.slug`, `compile.skillOverridesMaxChars`) though only `contextRoot` is
  read — WI-5 owns the rest.
- `packages/context-core/src/fs/resolve-path.ts` — `resolveContextPath()` /
  `toLogicalContextPath()`, the one shared logical-`context/...`-to-physical
  helper every corpus-path-resolving function now goes through. Throws
  `ScopeViolationError` (not a plain `Error`) on a malformed logical path.
- `createLoader()` gains optional `{ root }`. The parameter several functions
  called `repoRoot` (`resolveScope`, `walkContext`, `resolveCitation`,
  `verifyCitation`, `readContextFile`, `validateCorpus`, `writeFindings`,
  `appendOutcome`) is renamed to `root` — it always meant corpus root, never
  repo root; `repoRoot` stays required on `createLoader` itself and still
  governs `schemaDir`/`taintLedgerPath` (genuinely repo-relative, unaffected).
- `git mv context/{org,demand-gen,legal,accounts} → examples/demo-corpus/`.
  `context/` now holds only `schema/` (unmoved — schema is repo-relative, not
  corpus-relative), `templates/` (new, empty, WI-5 fills it), `.gitkeep`.
  History preserved (`git log --follow`); `corpus.lock.json` regenerated,
  byte-identical hashes, unchanged logical keys.
- `corpus:validate` / `check:no-real-data` / `eval:lock` / the eval runner all
  default to `examples/demo-corpus`, accept `--root`/`ASH_CONTEXT_ROOT`,
  verified (adversarially, via a poisoned `ash.config.json`) to never fall
  through to it when no override is given.
- New `pnpm check:context-empty` — blocking CI guard, allowlist
  `{schema, templates, .gitkeep}` at the top level of `context/` only (shallow,
  not recursive).
- `.claude/hooks/protect-paths.ts` + `.claude/settings.json` protect **both**
  `context/**` and `examples/demo-corpus/**` (belt-and-braces during the
  transition — spec judgement call #4).
- No skill YAML, eval-case path, or citation-path string touched anywhere —
  `pnpm skills:sync:check` shows no drift. The load-bearing design call (spec
  judgement call #1: `context/` is a logical prefix the loader rewrites to the
  physical root at resolution time, not a root-relative-grants rewrite) held
  through the full implementation with zero skill-contract churn.

**Five Important-severity findings from review, fixed before merge:** an
unused `DEFAULT_ASH_CONFIG` constant; a plain `Error` in `resolveContextPath`
that should have been (and now is) `ScopeViolationError`; a false-positive-green
gap in `corpus:validate`'s CLI (a stale `--root`/positional arg silently
reporting "OK" on 0 files checked instead of flagging it); a missing
`checkContextEmpty` export from `index.ts`'s public barrel; and (this session,
not a code review finding) the eval run itself needing a workspace-scoped API
key — see the `ANTHROPIC_API_KEY` note above.

**Deviation from the spec's explicit function list (not a defect, a scope
correction):** `findings/write-findings.ts`, `outcomes/append-outcome.ts`, and
one direct read in `evals/runner/run-suite.ts` (the rubric judge's raw
meeting-note text) weren't named in the spec's "functions to touch" list but
had the identical bug — they built a logical `context/...` string internally
and joined it straight onto `repoRoot`. Left alone, findings/outcomes writes
would have silently landed in the emptied `context/` tree instead of
`examples/demo-corpus/`, a latent bug WI-2 would have inherited. Fixed in the
same PR; flagged during plan-mode exploration, not discovered late.
