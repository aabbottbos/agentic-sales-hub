# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-10** (intent 002 / `call-summary` **shipped** — PR #13
merged to `main`, `b135b08`. Next: WI-1 tenancy seam, intent 003).

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
| Synthetic corpus | `context/` | done — "Minimal + 1 opportunity" (Meridian Grid / Acme Logistics). Fictional; see `CORPUS.md`. **WI-1 will `git mv` this to `examples/demo-corpus/`.** |
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
   separately (PR #13). Next up: **WI-1 / intent 003** — the tenancy seam.

## The work chain (amendment §6–§11)

Strict dependency order. Each WI is its own committed intent → spec → plan → PR.
**Never weaken an eval gate to make a WI pass.**

| WI | What | Tier | Intent | State |
|---|---|---|---|---|
| **WI-0** | Rename to Agentic Sales Hub | T0 | — | **done** (PR #9) |
| **WI-1** | Tenancy seam — `config.ts` + `resolveContextRoot()`; `git mv context/ → examples/demo-corpus/`; `ash.config.json`; `check:context-empty` | T2 | 003 | not started |
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
`.anthropic-key` (gitignored) — `source .anthropic-key` before any `pnpm eval`
hitting `--suite call-summary` or `all`.

Baseline eval result: `evals/results/2026-09-10-0932036.json` (All gates pass,
regression vs `2026-09-07-434b594` PASS).
