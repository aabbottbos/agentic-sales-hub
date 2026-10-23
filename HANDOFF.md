# HANDOFF

Working-state notes for the next session. Not a spec — see `docs/` for those.
Last updated: **2026-10-23** (Intent 005, the team steel thread, **shipped to
`main`** via PR #23, `abd59fe`. Plans 006 (taint-ledger hardening, PR #25)
and 007 (`writeFindings` id retry, PR #26, `e587398`) followed it; latest
committed eval result `evals/results/2026-10-23-6b82567.json`: all hard gates
pass, no regression. **Plan 008 (Sonnet 5.5) is in progress** on branch
`feat/008-sonnet-5-5`. It's pushed with no PR yet, and blocked on a decision
about one call-prep misquote; see "Next action" item 3.
**Priority call, 2026-10-23:** keep building capabilities as fast as possible.
The North Star's October writeup + demo video is deferred, not cancelled.
Next up: see "Next action" below.)

## Next action

Build order agreed 2026-10-23 (each its own branch + PR). Doc numbers
(`docs/intent/`, `docs/plans/`) share one sequence and are assigned **at
filing time**: take the next free number then. Don't pre-assign them here,
because T1 plans consume numbers too (006 = taint hardening, 007 = findings
id retry).

1. ~~**Taint-ledger short-phrase hardening**~~ (follow-up 12): **done**, plan
   006. It also closed follow-up 14 (the eval baseline tie-break).
2. ~~**`writeFindings` mint-and-retry**~~ (follow-up 13): **done**, plan 007
   (PR #26).
3. **Move skills from `claude-sonnet-5` to Sonnet 5.5** (plan 008,
   `docs/plans/008-sonnet-5-5.md`). **In progress, branch
   `feat/008-sonnet-5-5`.**
   - **Done:** `call-summary`/`call-prep` are on `claude-sonnet-5-5`. `llm.ts`
     sends Sonnet 5.5 through the beta Messages path with
     `thinking: {type: "between_tools"}` (`disabled` is a 400 on 5.5), effort
     `high`, and server-side refusal fallback (`fallbacks: "default"`). It
     throws a clear error on `stop_reason: "refusal"` and warns when a
     fallback model served the request. The judge stays on `claude-sonnet-5`,
     so the instrument doesn't change in the same PR.
   - **Calibration:** 3x each suite, 2026-10-23. `call-summary` passed
     citation validity 1.00 on 3/3 runs (rubric 3.67 / 4.0 / 2.67; the third
     had one judge call fail, and the rubric is advisory). `call-prep` passed
     1.00 on 2/3 runs (rubric 5.0 / 4.25). Its run 2 scored **0.958, FAIL**:
     1 of 24 citations was a stitched quote (follow-up 15).
   - **Pending decision before the PR**, chosen by the user:
     - (a) **Recommended:** fix follow-up 15 first, with a bounded
       regenerate-once in the impl when a quote isn't verbatim. The gate
       stays unchanged, and it helps both models.
     - (b) Try effort `medium`.
     - (c) Ship as-is and track the rate.
     After the decision: run the full suite with `--write-results`, open the
     PR, and record the numbers in the plan doc.
4. **`proposal-draft`** (WI-3), T2.
5. **Corpus expansion** (WI-4), T2, with ≥2 closed deals and populated
   `outcomes.jsonl`. Split the remaining MCP scope into its own intent.
6. **The compounding loop**, T2. It depends on corpus expansion's closed
   deals.
7. **Adoption layer** (WI-5), T2. Needs the license and public-repo decisions
   first.
8. **Taint provenance on derived artifacts** (follow-up 16), T2. Slot it in
   before the compounding loop starts relying on artifacts as context.

## Intent 005 — team steel thread — SHIPPED (PR #23, `abd59fe`)

**Closing notes (2026-10-23):**

- **The API blocker was a revoked key**, not a credit balance: by 10-23 both
  local key files returned `invalid x-api-key`. New key installed locally
  (`.env.local`, `.anthropic-key`) and as the `ANTHROPIC_API_KEY` repo
  secret.
- **The first full eval run crashed** on one intermittent `call-prep`
  citation misquote. `runSkill` correctly refused to persist, but the suite
  didn't catch the throw, so no results file was written. Fixed in
  `bd991b6`: `runSkill` now throws a typed `CitationValidityError` listing
  every unresolved citation, and `runCallPrepSuite` records it as a scored
  FAIL. The misquote did not reproduce in 3 direct reruns. The gate is
  unchanged.
- **The regression check picked the wrong baseline** (follow-up 14). It was
  verified by hand against the correct one: PASS.
- **`docs/` had been moved** (byte-identical) to `context/templates/docs/`
  for an Obsidian vault. It was restored, because `context/templates/` is
  reserved for tenant output templates (WI-5). `.obsidian/` is now
  gitignored; to use Obsidian, open the repo root as the vault.
- **`TEAM FOCUS.md`** is committed as `docs/AgenticSalesHub_TeamFocus_v1.md`.
  The North Star is committed too, but still needs reconciling with the team
  pivot.
- **`.claude/settings.json`:** the `Write` denies on `legal/**` and
  `evals/golden/**` were dropped (`e261528`). `protect-paths.ts` still blocks
  both.

**Why this exists:** a same-day pivot from single-seller to team/org support
(see `docs/AgenticSalesHub_TeamFocus_v1.md` — onboarding acceleration,
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
`89c8963`. A final whole-branch holistic review (beyond the per-task reviews)
found and closed one more gap: `writeFindings()` (the `sow-review` findings
persistence path) had been missed by Task 3's actor-threading and Task 6's
queue-wrapping — it hardcoded a fake `system/sow-review` actor into every
findings artifact and wasn't queue-serialized. Fixed in `42e3aef`, mirroring
Task 3's precedent exactly; no production caller existed yet, so this broke
nothing. `pnpm typecheck && pnpm test && pnpm build && pnpm lint` are green
throughout, including after this fix.

## The North Star (`docs/AgenticSalesHub_NorthStar_v1.md`, committed)

Governs `Spec_v2.md`, the Adoptability Amendment, and the SDLC Framework —
when a scope question can't be settled in a spec, it's settled here.
**Sequencing override (2026-10-23):** the user chose build velocity over the
October writeup; see the header.

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
| Context loader / security boundary | `packages/context-core/` | done — `createLoader()` is the entrypoint (`src/loader.ts`). `writeArtifact()`/`appendOutcome()`/`writeFindings()` require an `actor` and serialize per opportunity (intent 005). |
| Published context spec | `context/schema/` | done — 17 JSON Schemas (draft 2020-12) on `main`; `brief-output.json` lands with WI-2. `context/schema/README.md` is the path→schema table. |
| Synthetic corpus | `examples/demo-corpus/` | done — "Minimal + 1 opportunity" (Meridian Grid / Acme Logistics). Fictional; see `CORPUS.md`. |
| Skills | `packages/skills/` | `find-evidence` + `sow-review` deterministic (ADR `docs/decisions/0001`); `call-summary` and `call-prep` LLM-backed, both merged to `main`. `call-prep` is the first skill with a write grant. |
| Eval harness | `evals/` | done on `main`, including `runCallPrepSuite()` (mutates a scratch corpus copy, not `examples/demo-corpus/` directly). |
| Enforcement | `.claude/hooks/`, `.claude/settings.json` | done — quarantine-inbound, protect-paths (PreToolUse); format-on-write (PostToolUse). |
| CI | `.github/workflows/` | done — `ci.yml`, `evals.yml`, `claude.yml`, `claude-review.yml`. |
| Review policy | `REVIEW.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS` | done |
| MCP server | `packages/mcp-agentic-sales-hub` | **done** (plan `docs/plans/005-team-steel-thread.md`, Tasks 7–10) — two tools (`call-prep`, `call-summary`) wrapping `runSkill()`, plus an in-process file watcher on `inbound/**` auto-triggering `call-summary` under sentinel actor `system:file-watcher`. Merged (PR #23). |

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
4. **North Star needs reconciling with the team pivot.** It's committed now
   (on `main` via PR #23). It still frames the work as five skills plus the
   compounding loop for a single seller, and doesn't name multi-user support
   or background execution.
5. **Team Focus doc:** done. It's committed as
   `docs/AgenticSalesHub_TeamFocus_v1.md` (PR #23).
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
11. **Intent 005's eval regression run:** done. It turned out the old API
    key had been revoked. After replacing it, the full run passed
    (`evals/results/2026-10-23-bd991b6.json`) and 005 merged as PR #23.
12. **Taint-ledger short-phrase matching:** done (plan 006). `match()` now
    has two profiles:
    - **`strict`** is the default and is what the hook uses. It adds rule 4:
      a distinctive 6-word run with ≥3 content words, lifted from an inbound
      doc, anywhere in a longer value.
    - **`standard`** is used by `assertNotTainted` on the MCP/watcher persist
      path, whose summaries legitimately echo their own source.

    Both profiles now match on word boundaries, and a whole short phrase
    needs ≥3 content words. Calibration over 1,586 legitimate paragraphs
    found no new false positives outside `legal/**` (the numbers are in the
    plan doc). Paraphrase is still undetectable by verbatim matching; see
    follow-up 16.
13. **`writeFindings` id minting:** done (plan 007). A same-tick default id
    now re-mints as `<base>-2`, `-3`, and so on: it lists `artifacts/`, then
    writes with `flag: "wx"` plus bounded retry on EEXIST, the same pattern
    as `writeArtifact`. The queue integration test no longer needs explicit
    ids to work around the collision.
14. **Eval baseline tie-break:** done (plan 006 PR). Same-date result files
    now order by the commit that first added them
    (`latestResultFile()` in `evals/runner/compare.ts`; an uncommitted file
    counts as newest). No report-format change was needed, because CI checks
    out with `fetch-depth: 0`.
15. **`call-prep` occasionally misquotes a citation.** It has happened on
    both models.
    - **Sonnet 5:** 1 crashing run on 10-23 (before `bd991b6` made it a
      recorded FAIL), then clean on 2 later full runs and on CI.
    - **Sonnet 5.5:** 1 of 3 calibration runs.
    - **Example (5.5):** it cited
      `org/evidence/cs-midwest-freight.md` with the quote
      `"6 weeks to 3.5 (down ~40%)"`. That stitches together the frontmatter
      line `6 weeks to 3.5 weeks (down ~40%)` and the body text
      `from 6 weeks to 3.5,`, so the quote appears nowhere in the file.
    - **Effect:** the gate catches it correctly, but it makes the `evals` CI
      check flaky.
    - **Candidate fix:** when a quote isn't a verbatim substring of its
      cited file, regenerate once, telling the model which quote failed,
      before returning. Neither the gate nor the contract changes. Check the
      tier: it's an impl-internal retry with no prompt or contract change,
      so likely T1.
16. **Taint provenance on artifacts derived from inbound** (T2: schema plus
    skill contract). This is the real fix for summary laundering. A
    `call-summary` of an inbound transcript passes the `standard` profile,
    which allows short echoes and can't see a paraphrase. Once persisted, it
    reads as ordinary accumulating context to `call-prep`. Proposal: an
    artifact whose citations resolve into `inbound/**` carries a `tainted_by`
    field, and downstream skills wrap those artifacts in untrusted-content
    delimiters, just as `readInbound` does. Do this before the compounding
    loop starts reusing artifacts as evidence.
17. **Move the rubric judge to Sonnet 5.5.** `evals/judge/judge-model.json`
    is still `claude-sonnet-5`, deliberately kept apart from plan 008. Do it
    as its own change with a few calibration runs, so rubric deltas stay
    attributable.
18. **Uncommitted local change: the `/doctor` trim of `CLAUDE.md`**
    (2026-10-23). It removes the architecture directory tree, 7 standard
    `pnpm` command rows, and 2 inventory bullets: 28 lines, about 0.4k est.
    tokens, all derivable from the repo. It's sitting unstaged in the
    working tree. Commit it as its own small PR, which runs `evals.yml`
    because `CLAUDE.md` is eval-gated, or discard it with
    `git checkout -- CLAUDE.md`.

## The work chain (amendment §6–§11, reordered by intent 005)

Strict dependency order. Each WI is its own committed intent → spec → plan → PR.
**Never weaken an eval gate to make a WI pass.**

| WI | What | Tier | Intent | State |
|---|---|---|---|---|
| **WI-0** | Rename to Agentic Sales Hub | T0 | — | **done** (PR #9) |
| **WI-1** | Tenancy seam — `config.ts` + `resolveContextRoot()`; `git mv context/ → examples/demo-corpus/`; `ash.config.json`; `check:context-empty` | T2 | 003 | **done** (PR #17) |
| **WI-2** | `call-prep` + the write path — `writeArtifact()` / `appendOutcome()`; `brief-output.json`, `outcome-record.json`; protect-paths denies direct writes to `**/artifacts/**` | T2 | 004 | **done** (PR #21, `98a6e74`) |
| **Team steel thread** | Actor identity; per-opportunity write queue; `packages/mcp-agentic-sales-hub` (2 tools: `call-summary`, `call-prep`); in-process file watcher on `inbound/**` → auto-triggers `call-summary` | T2 | **005** | **done** (PR #23, `abd59fe`) |
| **WI-3** | `proposal-draft` — built-in default structure; **new hard gate: no uncited price/discount/delivery commitment** | T2 | next free at filing | not started |
| **WI-4** | Remaining `packages/mcp-agentic-sales-hub` scope (beyond the steel thread) + §10 corpus expansion (3 more opportunities, ~12 meeting notes) | T2 | next free at filing | not started — split the remaining MCP scope into its own intent |
| **WI-5** | Adoption layer — `/onboard` setup skill; 3 knob schemas (`voice`/`playbook`/`output-template`); `skills:sync` → `skills:compile` w/ provenance header; `routeIntake()` + its default-deny eval case; `pnpm init:context`; README rewrite (adoption path first) | T2 | next free at filing | not started |

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
