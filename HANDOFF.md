# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-08**.

## Where we are

**Phase 0 (Context Substrate + Eval Harness) is done and merged to `main`**
(`d18595e..d263daa`, 11 commits, plan `docs/plans/001-context-substrate-eval-harness.md`).
**The SDLC loop is live and exercised** — branch protection, labels, and the
`evals.yml` PR-comment path all verified through real PRs (#3, #5). **Phase 1
(Deal Spine) is starting** — see the last section.

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
| Synthetic corpus | `context/` | done — "Minimal + 1 opportunity" (Meridian Grid / Acme Logistics). Fictional; see `CORPUS.md`. |
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
  `.claude/.taint-ledger.jsonl` (or `$DEAL_DESK_TAINT_LEDGER`) and blocks any
  Write/Edit/Bash whose arg text matches an ingested inbound doc. The eval
  injection-harness sets `DEAL_DESK_TAINT_LEDGER` to
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
  Phase 1 swaps an Agent-SDK impl into `packages/skills/src/impl/` behind the
  same contract.
- `finding.json` `suggested_redline` required for blocker/major, optional for minor.
- `find-evidence` read grant excludes `outcomes.jsonl`.
- Node `engines` allows 24+ for local dev; `.nvmrc` + CI pin 22.
- `docs/intent/` is singular (repo convention); the SDLC doc says `docs/intents/`.

## Done since Phase 0

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

## Phase 1 — Deal Spine (spec §11, target Sep 22 – Oct 24) — IN PROGRESS

Tier:2. Full chain: `/write-intent` → `/write-spec` → plan (in plan mode), tracked
as `docs/intent/002-…` → `docs/specs/002-…` → `docs/plans/002-…`.

### Slicing decision (2026-09-08)

Phase 1's spec-level scope (all 3 generation skills + MCP server + trace emission
+ §10 corpus expansion) is too large for one honest review. Slicing it:

- **Intent 002 (this one) — `call-summary` end-to-end.** Prove the LLM-backed
  generation path on the lowest-liability, most-checkable generation skill:
  raw meeting note → `{ summary, commitments[], next_steps[], context_deltas[],
  citations[] }` validated against a new `summary-output.json`. New eval class:
  **generation** — LLM-judge rubric (grounding/completeness/tone/structure, ≥ 4.0/5)
  plus deterministic citation-validity (= 1.00) and commitment-recall (≥ 0.90).
  **This slice does NOT** persist an artifact (no `writeArtifact`), build the MCP
  server, or add `call-prep` / `proposal-draft`.
- **Intent 003 (later) — `call-prep` + `proposal-draft` + `writeArtifact()`** —
  apply the pattern 002 establishes; add artifact persistence
  (`kind: brief` / `kind: proposal`).
- **Intent 004 (later) — `packages/mcp-deal-desk` + the §10 corpus expansion**
  (3 more opportunities, ~12 meeting notes total).

### Intent 002 — decisions locked

| | |
|---|---|
| Skill | `call-summary` only. Tier `generation`. LLM-backed impl in `packages/skills/src/impl/call-summary.ts` behind the existing `SkillImpl` interface. |
| Input | A path to a corpus meeting note (`context/accounts/.../meetings/*.md`) — accumulating context, not `inbound/**`, not untrusted. No change to `meeting.json`. |
| Output | Structured object only, **no persistence this slice**. New `context/schema/summary-output.json` output-contract schema. |
| Rubric | LLM-judge (spec §8). Judge prompt + model + rubric versioned in the repo. Citation validity stays deterministic. |
| SDK / model API | **Open — the spec decides.** `@anthropic-ai/sdk` direct vs. Claude Agent SDK. Drives CI auth (`ANTHROPIC_API_KEY` vs. Claude Code OAuth token). |

### Intent 002 — open questions for the spec

1. Which SDK / model API (see table).
2. How the LLM-judge run is gated in CI when the model call is flaky — retry
   policy, hard-fail vs. skip-with-warning, on `evals.yml` critical path or a
   separate job.
3. Concrete shape of `context_deltas[]` — a labeled list, or a defined shape a
   later step could apply.
4. Whether the existing 3 Acme meeting notes + 1–2 new ones are a sufficient
   golden set, or `call-summary` needs a 2nd opportunity's notes (which would pull
   in the §10 corpus expansion this slice is trying to defer to intent 004).

### Status

- Issue **#7** opened (`[Intent]: Phase 1 — Deal Spine …`, labels `intent`,
  `tier:2`).
- Intent draft written (in the session transcript) — **not yet committed** to
  `docs/intent/002-call-summary-generation-path.md`. Next: finish the
  `write-intent` review, commit the intent on a branch, then `write-spec`.

### Seam that's already in place

The `SkillImpl` interface and `runSkill` output-contract enforcement accept an
LLM impl with no change to the schema, the harness, or the existing scorers. The
new pieces are the `summary-output.json` schema, the generation scorers
(rubric + commitment-recall), and the judge harness.
