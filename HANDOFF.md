# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-09-08**.

## Where we are

**Phase 0 (Context Substrate + Eval Harness) is done and merged to `main`**
(`d18595e..d263daa`, 11 commits, plan `docs/plans/001-context-substrate-eval-harness.md`).

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

## Open follow-ups

1. **Branch protection on `main`** — not yet configured. GitHub Settings →
   Branches: require PRs, require checks `verify` + `gitleaks` (+ `evals` on
   skill/schema/eval PRs), block direct pushes. Last piece of framework §6.4.
2. **Labels** — create `tier:0/1/2`, `intent`, `agent-ready`, `overnight`,
   `eval-regression`, `human-only` (`gh label create`).
3. **`evals/golden/README.md` + `corpus.lock.json`** — deferred. `evals/golden/**`
   is deny-listed in `.claude/settings.json` and blocked by protect-paths (by
   design — it's the golden set). Add them via a `tier:0` PR that touches
   `evals/golden/` — which also exercises `evals.yml` on an `evals/**` change for
   the first time. `evals/golden/allowed-slugs.txt` already exists (the file the
   checks actually read).
4. **`night-shift.yml` + the detector** — framework §7, deferred to Week 3+.
   Not started.

## Next: Phase 1 — Deal Spine (spec §11, target Sep 22 – Oct 24)

Its own intent → spec → plan. Scope:

- `call-prep`, `call-summary`, `proposal-draft` — **generation** tier, the first
  **LLM-backed** skills. Output = markdown + citation map + `[unsourced]`
  markers. New gate: generation rubric ≥ 4.0/5.
- `packages/mcp-deal-desk` — the MCP server (`context.read` / `context.search` /
  `artifact.write` / `skill.run` / `trace.get`), consuming `loadSkill()` from
  `packages/skills`.
- Trace emission + outcome records wired through `runSkill`.
- The rest of the spec §10 corpus: 3 more opportunities at different stages,
  ~12 meeting notes total, a 3rd case study is already present.

The `SkillImpl` interface and `runSkill` output-contract enforcement are already
built to accept an LLM impl with no change to the schema, the harness, or the
scorers.
