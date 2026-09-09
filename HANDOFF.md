# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-09** (spec 002 cold-reviewed + approved, PR #11 ready to merge).

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
   (intent 003–007) is authoritative. The old HANDOFF "intent 003/004" split is
   folded into WI-2 (`call-prep` + write path) and WI-4 (MCP + corpus). Intent
   002 (`call-summary`) is unchanged and proceeds now.

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

## Intent 002 — call-summary generation path — SPEC APPROVED, PR #11 ready to merge

Carved out of the amendment (proceeds in parallel with the WI chain).

- **Intent:** `docs/intent/002-call-summary-generation-path.md` — **merged** (PR #10, `a78e2d0`).
- **Spec:** `docs/specs/002-call-summary-generation-path.md` — **cold-reviewed and
  approved** (PR #11 comment, `c7c8540`). CI green. **Merge intent + spec together**
  (one design gate), then plan mode → `docs/plans/002-…`.
- **Cold-review outcome:** one edit — **OQ5 resolved plan-avoids-`SCHEMA_TYPES`**:
  the `runSkill` generation branch validates against the raw `summary-output.json`
  JSON Schema file directly (compiled in `packages/skills`), NOT via
  `context-core`'s `SCHEMA_TYPES` tuple or a new loader method. Keeps the intent's
  "not touched: `packages/context-core`" literally true. `finding` /
  `retrieval-result` still go through the registry; `summary-output` deliberately
  does not — the plan owns where the compiled validator lives. All other judgment
  calls (1–9) accepted as written.
- **Waved into the plan (no spec edit):** OQ7 (offsets already fixed by
  `resolve-citation.ts` — whole-file LF-normalized, frontmatter included);
  generation-branch throw-vs-flag; registry access from `run-suite.ts`.
- **Issue #7** stays open as the Phase 1 umbrella; commented with the spec link.
- **Gotcha for next session:** the intent/spec branches are ephemeral and get
  deleted on merge. Start each stage from a fresh branch off `main`; don't commit
  to `main` directly (it's protected, the commit bounces).

### Scope (locked in the intent, detailed in the spec)

`call-summary` **end-to-end and only that**. LLM-backed impl in
`packages/skills/src/impl/call-summary.ts` behind the existing `SkillImpl`
interface. Input: a path to a corpus meeting note
(`context/accounts/.../meetings/*.md`) — accumulating context, not `inbound/**`.
Read grant is `context/accounts/*/opportunities/*/meetings/**` **only** — no
`opportunity.md`, no write grant, `tools: [context.read]`.
Output: `{ summary, commitments[], next_steps[], context_deltas[], citations[] }`,
validated against a new **output-contract** schema `context/schema/summary-output.json`
(separate from `artifact.json`, which stays reserved for the WI-2 persisted-artifact
path). `context_deltas[]` is structured — `{field, observation, citation}` with a
small `field` enum. **No persistence** (no `writeArtifact`, no `outcomes.jsonl`) —
deferred to WI-2.

New **generation** eval class (`evals/cases/call-summary/`, scorers in
`evals/scorers/generation.ts` + `judge.ts`, judge harness in `evals/judge/`):
LLM-judge rubric (grounding/completeness/tone/structure, aggregate ≥ 4.0/5) +
deterministic citation-validity (= 1.00, resolve-only, reuses
`scoreRetrievalCitations`) + deterministic commitment-recall (≥ 0.90). Judge
prompt, judge-model ID, and rubric committed to the repo.

### Open questions — spec resolutions

1. **SDK** — resolved: `@anthropic-ai/sdk` direct, one seam function
   (`impl/llm.ts`). Model portability is an **explicit v1 non-goal**. Plan
   confirms the package version + seam location.
2. **CI auth + flaky judge** — resolved: `ANTHROPIC_API_KEY` GitHub secret;
   rubric gate runs **blocking, on the `evals.yml` critical path**; retry-median
   (first cut: 3 attempts, median, hard-fail < 4.0). Plan sets the tolerance
   band (first cut ±0.3) and the attempt/median numbers.
3. **`context_deltas[]` shape** — resolved: structured `{field, observation,
   citation}`. Plan finalizes the `field` enum against what the notes contain.
4. **Golden set** — start with the 3 existing Acme notes; plan may add **≤ 2**
   `acme-` notes during rubric calibration. Beyond → WI-4.

### New open questions the spec surfaced (for the plan)

5. **Does `summary-output` need to be a first-class `context-core` schema type**
   (`SCHEMA_TYPES` / registry, like `finding`/`retrieval-result`), or can the
   runner validate against the raw JSON Schema file? The registry route is
   low-surprise but means a `context-core` change inside a slice whose intent
   said "no `context-core` change" — call it out at merge if so.
6. **Rubric-anchor calibration is circular** until an impl exists. Plan sequence:
   schema + skeleton impl + deterministic scorers first, then calibrate anchors
   + tolerance band against real output. The 4.0 gate is fixed; anchors/band are
   calibrated.
7. **Citation span offsets** — file offsets (incl. frontmatter) vs. body-only.
   Must match what `resolveCitation` expects (`sow-review` cites by raw-file
   offset). Most likely source of a citation-validity < 1.00 failure — pin it in
   the plan.

### Judgment calls flagged in the spec (9 total — cold review starts there)

The load-bearing one: **JC #1** — "no change to `runSkill` / the eval harness"
is read as "no change to *signatures, types, and the case→score→gate pipeline*",
not "zero new code." `runSkill` gets a `generation` branch in its output-contract
switch (today it silently no-ops for non-retrieval/review tiers); `run-suite.ts`
gets a `runGenerationSuite()` + `"call-summary"` in `SuiteName` / `ALL_SUITES`.
Also: `IMPLS`, `PRODUCT_SKILL_IDS`, and the `sync-claude-skills.ts` filter all
gain `"call-summary"`; a generated `.claude/skills/call-summary/SKILL.md` is
committed and `skills:check` must stay green. If any of that reads as a seam
violation, the **intent's wording** needs a fix, not the approach.
