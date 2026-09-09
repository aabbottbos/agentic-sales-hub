# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-09**.

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

**Phase 1 is in progress** — intent 002 committed (PR #10), awaiting cold
approval; then `write-spec`. See the last section.

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
  same contract. (Intent 002 OQ1 leans `@anthropic-ai/sdk` direct, **not** the
  Agent SDK — model-portability is an explicit v1 non-goal; the spec confirms.)
- `finding.json` `suggested_redline` required for blocker/major, optional for minor.
- `find-evidence` read grant excludes `outcomes.jsonl`.
- Node `engines` allows 24+ for local dev; `.nvmrc` + CI pin 22.
- `docs/intent/` is singular (repo convention); the SDLC doc says `docs/intents/`.

## Done since Phase 0

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

## Intent 002 — call-summary generation path — COMMITTED, awaiting cold approval

Carved out of the amendment (proceeds in parallel with the WI chain).

- **File:** `docs/intent/002-call-summary-generation-path.md` — committed on
  branch `intent/002-call-summary-generation-path`, **PR #10** open, awaiting
  approval in a separate session (solo-discipline rule).
- **Issue #7** stays open as the Phase 1 umbrella; commented with the slice
  breakdown → WI-2 / WI-3 / WI-4.

### Scope (locked in the intent)

`call-summary` **end-to-end and only that**. LLM-backed impl in
`packages/skills/src/impl/call-summary.ts` behind the existing `SkillImpl`
interface — no change to `skill-def.schema.json`, `runSkill`, or the eval
harness shape. Input: a path to a corpus meeting note
(`context/accounts/.../meetings/*.md`) — accumulating context, not `inbound/**`.
Output: `{ summary, commitments[], next_steps[], context_deltas[], citations[] }`,
validated against a new `context/schema/summary-output.json`. **No persistence**
(no `writeArtifact`, no `outcomes.jsonl`) — deferred to WI-2.

New **generation** eval class: LLM-judge rubric
(grounding/completeness/tone/structure, ≥ 4.0/5) + deterministic citation-validity
(= 1.00) + commitment-recall (≥ 0.90). Judge prompt, model ID, rubric committed.

### Open questions the spec must settle

1. **Confirm `@anthropic-ai/sdk` direct** (not the Agent SDK), LLM call behind a
   single seam. Model-portability across foundation-model vendors is an
   **explicit v1 non-goal** — the eval gates are calibrated against one model +
   one judge model; a user-swappable model invalidates the golden-set scores.
   Keep the seam narrow so a later adapter stays possible.
2. **CI auth + flaky-judge gating** — `ANTHROPIC_API_KEY` vs. OAuth token
   (follows from OQ1); retry policy; hard-fail vs. skip-with-warning; `evals.yml`
   critical path vs. separate job.
3. **`context_deltas[]` shape** — labeled free-text list vs. a structured shape a
   later context-update / `writeArtifact` path could apply mechanically.
4. **Golden-set sufficiency** — 3 existing Acme notes, or 1–2 new ones.
   **Scope fence:** spec may add ≤ 2 new Acme meeting notes; a second
   opportunity or the §10 expansion kicks back to WI-4.

### Not open (spec-drafting work, not decisions)

- The rubric dimensions are settled; the spec writes the scale + anchor
  descriptions.
- Dating the intent — premature; the amendment reshuffled the sequence.

### Seam that's already in place

The `SkillImpl` interface and `runSkill` output-contract enforcement accept an
LLM impl with no change to the schema, the harness, or the existing scorers. The
new pieces are the `summary-output.json` schema, the generation scorers
(rubric + commitment-recall), and the judge harness.
