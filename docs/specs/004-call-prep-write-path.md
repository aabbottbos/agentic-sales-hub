# 004 — call-prep + the write path

**Tier:** tier:2
**Status:** draft
**Intent:** docs/intent/004-call-prep-write-path.md

## Summary

Two things ship together because the second has no caller without the first.
`writeArtifact()` and `appendOutcome()` — the persistence step intent 002
explicitly deferred ("a separate step (WI-2) persists it") — land in
`packages/context-core/src/write-path.ts` as the **only** sanctioned way to
create a file under `context/accounts/*/opportunities/*/artifacts/**` or append
to its `outcomes.jsonl`. `call-prep` ships as the second LLM-backed
**generation**-tier skill (the `call-summary` pattern from intent 002,
unmodified), reads meeting notes + org evidence + the opportunity + prior
artifacts, and produces a call-prep brief. `runSkill`'s existing `generation`
branch calls `writeArtifact()` after validating output — the skill itself
never writes; only the runner does, matching how `sow-review` findings are
persisted by a separate step, not the skill. `protect-paths` gains a rule
denying direct `Write`/`Edit`/`MultiEdit` to `**/artifacts/**` so the runner
path is the only path, not merely the encouraged one.

## Context model impact

- **Schema changes:**
  - **New:** `context/schema/brief-output.json` — an **output-contract**
    schema (like `summary-output.json`), validating `call-prep`'s in-memory
    return before it is persisted. Same citation shape as `summary-output.json`
    (`{path, quote, span}`, skill computes `span` from a model-returned
    `quote` — intent 002 amendment A2's resolution carries over unchanged,
    Judgment call #2). Draft shape:

    ```jsonc
    {
      "$id": "https://agentic-sales-hub.dev/schema/brief-output.json",
      "title": "Call-prep brief (call-prep output contract)",
      "type": "object",
      "properties": {
        "goal": { "type": "string", "minLength": 1 },
        "what_we_know": {
          "type": "array",
          "items": { "$ref": "#/$defs/item" }
        },
        "talking_points": {
          "type": "array",
          "items": { "$ref": "#/$defs/item" }
        },
        "risks": {
          "type": "array",
          "items": { "$ref": "#/$defs/item" }
        },
        "citations": { "type": "array", "items": { "$ref": "#/$defs/citation" } },
        "unsourced_claims": { "type": "array", "items": { "type": "string", "minLength": 1 } }
      },
      "required": ["goal", "what_we_know", "talking_points", "risks", "citations", "unsourced_claims"],
      "additionalProperties": false,
      "$defs": {
        "item": {
          "type": "object",
          "properties": {
            "text": { "type": "string", "minLength": 1 },
            "citation": { "$ref": "#/$defs/citation" }
          },
          "required": ["text", "citation"],
          "additionalProperties": false
        },
        "citation": {
          "type": "object",
          "properties": {
            "path": { "type": "string", "minLength": 1 },
            "quote": { "type": "string", "minLength": 1 },
            "span": {
              "type": "array",
              "prefixItems": [{ "type": "integer", "minimum": 0 }, { "type": "integer", "minimum": 0 }],
              "minItems": 2, "maxItems": 2
            }
          },
          "required": ["path", "quote", "span"],
          "additionalProperties": false
        }
      }
    }
    ```

    This is the intent's first open question resolved: `brief-output.json`
    reuses `summary-output.json`'s citation/`[unsourced]` machinery exactly,
    but is **not** structurally identical — a brief has no `owner`
    (commitments are a call-summary concept; a brief has no counterparty
    commitments yet, it prepares for a call that hasn't happened) and is
    sectioned by talk track (`goal` / `what_we_know` / `talking_points` /
    `risks`), matching the existing hand-authored fixture
    `examples/demo-corpus/.../artifacts/a-0001-brief.md`. See Judgment call #1.

  - **New:** `context/schema/outcome-record.json`. The intent names this file,
    but `context/schema/outcome.json` already exists (shipped in Phase 0,
    schema `$id` `outcome.json`, used by `appendOutcome` today) and is
    structurally exactly what an outcome record needs — see Judgment call #3.
    This spec does **not** add a second, parallel schema; it treats the
    intent's `outcome-record.json` name as referring to the existing
    `outcome.json`, unchanged. Flag if you intended a genuinely new/renamed
    schema.

  - **Not touched:** `context/schema/artifact.json`. `writeArtifact()` writes
    a file that validates against it — `kind: "brief"` is already in its enum,
    `citations[]`/`unsourced_claims`/`generated_by`/`superseded` already exist.
    The frontmatter `citations[]` shape (`{claim, path, span}`) differs from
    `brief-output.json`'s runtime shape (`{path, quote, span}` per item); the
    render step in `writeArtifact()` is what maps one to the other (adds
    `claim` = the item's `text`, drops `quote` from the persisted citation).
    This mirrors exactly what `write-findings.ts`'s `renderFindingsArtifact`
    already does for `sow-review` (embeds the structured payload, adds
    frontmatter). No schema change.

- **Mutability class of touched context:**
  - `call-prep`'s inputs (meeting notes, org evidence, opportunity, prior
    artifacts) are all read-only to it — **accumulating** (`meetings/**`,
    `opportunity.md`, `artifacts/**`) and **canonical** (`context/org/**`,
    `context/demand-gen/**`). It writes neither.
  - `writeArtifact()`'s output — the new artifact file — is **accumulating**
    (`mutability: accumulating`, same as every other file under
    `opportunities/**`). It is always a new file (`flag: "wx"`, same
    exclusive-create pattern `write-findings.ts` uses) — never an overwrite,
    matching invariant #3.
  - `appendOutcome()`'s output (`outcomes.jsonl`) is **accumulating** by
    construction — already true of the existing implementation (append-only
    file write, no read-modify-write).

- **Provenance / citation requirements:**
  - Every `what_we_know` / `talking_points` / `risks` item carries a
    resolvable `{path, quote, span}` citation into a file the skill actually
    read. A claim with no resolvable source goes in `unsourced_claims[]`
    instead of being asserted (invariant #4) — identical contract to
    `call-summary`.
  - Citation validity is deterministic, resolve-only, gated at 1.00 — reuses
    `resolveCitation`, the same as `call-summary`'s `checkGenerationCitations`
    path, generalized (see Skill contract / Judgment call #5) to not
    hardcode the `commitments`/`next_steps`/`context_deltas` field names.
  - `writeArtifact()` re-validates the flattened citation set against the
    **target file's own frontmatter** shape (`{claim, path, span}`) as part of
    `artifact.json` schema validation before writing — a second, independent
    check beyond the output-contract check `runSkill` already did on the raw
    model output, catching any bug in the render/mapping step itself.

## Skill contract

- **Tier:** generation
- **Output contract:** a structured object (goal + three cited sections) +
  citation map + `unsourced_claims[]`, validated against
  `context/schema/brief-output.json`. Evaluated by rubric score (advisory,
  target ≥ 4.0/5, same advisory status as `call-summary`'s per intent 002
  amendment A1 — see Judgment call #6) + citation validity (blocking, = 1.00).

- **Draft YAML skill definition** (`packages/skills/src/definitions/call-prep.yaml`):

  ```yaml
  id: call-prep
  tier: generation
  version: 1
  description: >-
    Prepare a call-prep brief for an upcoming meeting on one opportunity —
    goal, what we know, talking points, and risks, each citing the meeting
    notes, org evidence, opportunity record, or prior artifacts that support
    it. Claims with no source are marked [unsourced], never asserted. Output
    is persisted as a new artifact through writeArtifact(); an outcome record
    opens automatically as unused.
  context_grants:
    read:
      - context/accounts/{account}/opportunities/{opp}/meetings/**
      - context/accounts/{account}/opportunities/{opp}/opportunity.md
      - context/accounts/{account}/opportunities/{opp}/artifacts/**
      - context/accounts/{account}/account.md
      - context/accounts/{account}/people/**
      - context/org/**
      - context/demand-gen/**
    write:
      - context/accounts/{account}/opportunities/{opp}/artifacts/**
  inputs:
    account_slug:
      type: string
      required: true
    opp_id:
      type: string
      required: true
    meeting_context:
      type: string
      required: false
  output:
    schema: context/schema/brief-output.json
    requires_citations: true
  eval_suite: evals/cases/call-prep/
  tools:
    - context.read
    - artifact.write
  ```

  Notes on the definition:
  - `inputs` is `account_slug` + `opp_id` (not a single document path, unlike
    `call-summary`) because a brief synthesizes across the whole opportunity,
    not one note — see Context grants for why the read scope is this wide.
    `meeting_context` is optional free text ("prep for Thursday's technical
    review") the skill can use to weight which prior material matters most;
    it is never itself a citable source.
  - `context_grants.read` uses `{account}`/`{opp}` placeholders exactly as
    `resolveScope`'s `substitute()` already supports — no scope-resolution
    code change. `scopeParams` at call time supplies `accountSlug`/`oppId`
    from the validated inputs.
  - `context_grants.write` is present (first generation-tier skill to carry
    one) — `skill-def.schema.json`'s `write` property already exists and
    already requires `^context/`; **no schema change**.
  - `tools` adds `artifact.write` — a new token, but `tools` is
    `{type: array, items: {type: string}}` with no enum in
    `skill-def.schema.json`, so this is data, not a schema change.

## Context grants

- **Read scope:** the full opportunity subtree (`meetings/**`,
  `opportunity.md`, `artifacts/**`) plus the account (`account.md`,
  `people/**`) plus all canonical org/demand-gen context. Justification: a
  call-prep brief's whole job is "here is everything relevant going into this
  call" — narrower than that (e.g. `meetings/**` only, `call-summary`'s grant)
  would make it unable to cite the org evidence, pricing, or ICP material a
  brief like `a-0001-brief.md` actually leans on (it cites
  `context/org/company.md` and `context/org/evidence/cs-midwest-freight.md`).
  **Explicitly excluded:** `context/legal/**` — invariant #6 names `call-prep`
  by name as the skill that must not read it, and a call-prep brief has no
  legitimate reason to cite legal guidance or the clause library. `inbound/**`
  is also excluded — see Security considerations.
  - **Considered and rejected:** granting only `context/org/**` +
    `meetings/**` (narrower, closer to `call-summary`). Rejected because it
    would make the existing `a-0001-brief.md` fixture — which cites
    `account.md` and `people/dana-reyes.md` — impossible to reproduce under
    the new skill; the fixture is treated as evidence of the intended scope,
    not just decoration. Flag in Judgment call #4 if you want it narrower and
    the fixture rewritten instead.
- **Write scope:** `context/accounts/{account}/opportunities/{opp}/artifacts/**`
  only — the exact path intent's "Proposed outcome" fixes. Justification:
  this is the one place a generation artifact is allowed to land; no other
  write target makes sense for a brief. The skill impl itself does not call
  `writeArtifact()` directly (see Skill contract) — the grant exists so
  `resolveScope`/`runSkill`'s enforcement has a declared boundary to check the
  runner's write against, consistent with how read grants are enforced today,
  even though the actual write happens one layer up in `runSkill`, not inside
  `impl.run()`. Judgment call #7.

## Security considerations

- **Does this touch `inbound/**`?** **No.** `call-prep`'s read grant has no
  `inbound/**` glob; `resolveScope`'s `assertInsideContext` plus the
  `^context/` pattern constraint in `skill-def.schema.json` mean an
  `inbound/**` glob would have to be added explicitly to the grant, and it
  is not. The quarantine hook and taint ledger are not in this skill's path,
  same as `call-summary`.
- **New attack surface introduced:**
  1. **The write path itself is new attack surface** — this is the actual
     point of the slice. `writeArtifact()` is now a function that puts a file
     on disk from LLM-influenced content (citation quotes, section text) for
     the first time in the codebase. Mitigations, all required and covered by
     Eval impact / How we'll know it worked: (a) `writeArtifact()` validates
     the rendered artifact against `artifact.json` before/after writing — a
     malformed or malicious-shaped write fails closed; (b) the write path
     targets are computed, not model-supplied — `accountSlug`/`crmId` come
     from `ctx.scopeParams` (validated, caller-supplied inputs), never parsed
     out of model output, so the model cannot direct *where* the write lands,
     only what artifact id suffix/content it produces within that fixed
     directory; (c) `flag: "wx"` (exclusive create, same as
     `write-findings.ts`) makes every write either a genuinely new file or an
     error — the model cannot cause an overwrite; (d) `protect-paths` denies
     any *direct* `Write`/`Edit`/`MultiEdit` tool call to `**/artifacts/**`,
     closing the other route to the same directory (an agent session editing
     the file by hand, not through `writeArtifact()`).
  2. **A second live model call in CI**, same shape as `call-summary`'s
     (intent 002's attack-surface item #1) — same mitigations apply
     unchanged: `ANTHROPIC_API_KEY` as a GitHub secret, the single `complete()`
     seam in `impl/llm.ts` (reused, not duplicated), non-determinism scoped to
     the advisory rubric only (citation validity, the blocking gate, is
     deterministic).
  3. **`writeArtifact()`'s id-minting must be collision-free** (intent's
     second open question). A collision is not just a correctness bug here —
     two concurrent runs racing to the same `<id>-<kind>.md` path is a
     mitigated-by-`wx` scenario (second write fails loudly) but a *predictable*
     id scheme (e.g. pure sequence number re-derived by listing the directory)
     is a TOCTOU risk under real concurrency. Resolved in Judgment call #8.
- **Standing disclaimer:** none needed beyond what already exists. A
  call-prep brief is an internal work product (call prep), not review output
  — the `sow-review` "not legal advice" disclaimer doesn't apply, matching
  `call-summary`'s prior resolution.

## Non-goals / out of scope

`call-prep` + the write path in this slice explicitly do **not**:

- **Implement `proposal-draft`** or its hard "no uncited price/discount/
  delivery commitment" gate. (→ WI-3 / intent 005.)
- **Implement `routeIntake()`** or any auto-classification of incoming
  content into `meetings/**` vs `inbound/**` vs canonical. The intent names
  this explicitly as deferred to WI-5; `writeArtifact()` never decides *where*
  something goes beyond the fixed artifacts path, and never touches
  `meetings/**` or `inbound/**` at all.
- **Load or enforce an org output template.** `writeArtifact()`'s template
  check exists as a call site (a function parameter / lookup) but is a no-op
  — always passes — when no `context/org/templates/<kind>.md` exists, per
  the intent's explicit constraint. Template *authoring* and *enforcement
  logic* beyond "presence check, no-op if absent" is WI-5.
- **Reshape the `Outcome` enum.** Ships exactly
  `sent | won | lost | redline_accepted | redline_rejected | superseded | unused`,
  per intent constraint, with no accommodation yet for the North Star's
  not-yet-slotted evidence-reuse-rate work (HANDOFF "Open follow-ups" #5) —
  that is a separate future T2 change, not opened here.
- **Build the MCP server** (`packages/mcp-agentic-sales-hub`) — `tools:
  [context.read, artifact.write]` in the skill definition is the same kind of
  forward-looking tool-name-as-data every other skill definition already
  uses; no MCP tool actually exists yet. (→ WI-4.)
- **Add a second opportunity or expand the corpus.** (→ WI-4, and WI-4's
  intent per HANDOFF must additionally carry the closed-deal requirement —
  not this slice's concern.)

**Reverses a standing non-goal?** **No.** All product-level non-goals from
the v2 spec remain intact — this does not add MSA/SOW generation, e-signature,
proposal publishing/hosting, CRM sync, or any claim of legal advice. A
call-prep brief is squarely "the layer between 'we have a meeting' and 'we
have signed paper,'" the product's stated job. `writeArtifact()` persisting a
brief is not "proposal publishing" — it is a file in the seller's own repo,
same trust boundary as every other accumulating file.

## Eval impact

- **New eval suite:** `evals/cases/call-prep/` — a generation-class golden
  set, same shape as `evals/cases/call-summary/`. Minimum set: one case
  against the existing Acme opportunity (`account_slug: acme-logistics`,
  `opp_id: 006Ax0000GkLmNpQAA`), calibrated against the pre-existing
  `a-0001-brief.md` fixture as a loose reference for what a competent brief
  covers (not a byte-for-byte expected output — the model will not reproduce
  it verbatim). The plan sets whether additional synthetic prep scenarios are
  needed to calibrate the advisory rubric, same latitude intent 002's spec
  gave `call-summary` (≤ 2 additional notes there); this spec does not
  pre-commit a number.
- **New/extended scorers:**
  - Citation validity: reuses `resolveCitation` resolve-only, generalized in
    `runSkill`'s generation branch to read citations from whatever array
    fields `def.output.schema` declares rather than the `call-summary`
    -specific `commitments`/`next_steps`/`context_deltas` names hardcoded
    today (Judgment call #5). **Gate = 1.00, blocking** — this is a hard
    gate, not advisory, per intent's "How we'll know it worked."
  - Rubric: a `call-prep`-specific prompt/anchors in `evals/judge/`
    (dimensions TBD by the plan — likely grounding / usefulness-for-the-call
    / structure / tone, adapted from `call-summary`'s four). **Advisory**,
    target ≥ 4.0/5, tracked the same way intent 002 amendment A1 established
    for `call-summary`. **Ratified at review: held off deliberately, not
    attempted as blocking for this slice** — tracked as a standing decision
    to revisit (Judgment call #6), not something this spec closes.
- **New unit-test coverage** (`packages/context-core`):
  - `writeArtifact()`: refuses a write outside the calling skill's declared
    grant; refuses (or rather, is a no-op for) a missing output template;
    mints a collision-free id under concurrent calls; opens an `unused`
    outcome record automatically on every successful write; the artifact it
    writes re-validates against `artifact.json`.
  - `appendOutcome()`: already covered by existing tests
    (`append-outcome.test.ts`) — no behavior change, so no new tests required
    here beyond whatever `writeArtifact()`'s auto-open-outcome path adds.
  - `protect-paths` hook: a direct `Write`/`Edit` to
    `context/accounts/*/opportunities/*/artifacts/*.md` (and the
    `examples/demo-corpus/` dual-root equivalent, per WI-1) is blocked; a call
    through `writeArtifact()` (not a hook-visible tool call at all — it's a
    library function called from the runner process) is unaffected.
- **Eval-harness mutation question (intent's first open question),
  resolved:** `pnpm eval --suite call-prep` runs `writeArtifact()` for real,
  against a **scratch copy of the corpus**, not `examples/demo-corpus/`
  directly — the same `mkdtemp` + `cp` pattern `write-findings.test.ts` and
  `append-outcome.test.ts` already use for unit tests, applied at the eval
  runner level via `ASH_CONTEXT_ROOT` (or an explicit `root` override) pointed
  at the temp copy for the duration of the suite. Rationale: (a) the
  gate/gating story ("does `writeArtifact` actually produce a valid,
  citation-resolving artifact") is only tested by really calling it, so a
  dry-run mode would test something weaker than the real path; (b) mutating
  the committed `examples/demo-corpus/**/outcomes.jsonl` / adding real
  artifact files on every CI run is unacceptable — it would make the corpus
  non-reproducible and eventually merge-conflict-prone. No
  `writeArtifact()` dry-run/preview mode ships in this slice; the eval
  runner's scratch-copy wrapper is the mechanism instead. Judgment call #9.
- **Gates this must clear (the full set for a green PR):**
  - `call-prep`: **citation validity = 1.00** (blocking, deterministic).
    Rubric ≥ 4.0/5 is advisory/tracked, not blocking (Judgment call #6).
  - `writeArtifact()` / `appendOutcome()` unit tests, all green (see above).
  - `protect-paths` hook test suite: new case for `**/artifacts/**` direct
    writes, blocking.
  - **No net regression** vs. the last committed result in `evals/results/`
    on `sow-review`, `find-evidence`, `call-summary`.
  - `pnpm corpus:validate` — any new eval-fixture artifacts (if the plan adds
    any beyond the scratch-corpus eval mechanism) validate cleanly;
    `brief-output.json` is well-formed JSON Schema and loads in the registry.
  - `check:no-real-data` + `gitleaks` — zero findings.
- **Every future `call-prep` or write-path production defect becomes a
  permanent case** in `evals/cases/call-prep/` or the `write-path.ts` unit
  suite (standing rule).

## Judgment calls for review

Start here.

1. **`brief-output.json` is a new schema, structurally similar to but not
   identical to `summary-output.json`** — resolves intent OQ2. Reuses the
   citation/`[unsourced]` machinery; drops `owner` (no concept of "whose
   commitment" in a pre-call brief); sections by `goal`/`what_we_know`/
   `talking_points`/`risks` to match the existing `a-0001-brief.md` fixture.
   Flag if you want a materially different section set — I treated the
   pre-existing fixture as load-bearing evidence of intended shape since it
   predates this spec and nothing in the intent contradicts it.

2. **Citation shape is `{path, quote, span}`, not `{path, span}`** — carries
   forward intent 002 amendment A2 (models cannot produce reliable byte
   offsets) without re-deriving it. Flag if you think call-prep's inputs are
   different enough (e.g. shorter source spans) that raw spans would work
   here even though they didn't for call-summary — I don't think they are,
   the underlying model limitation is the same.

3. ~~Intent's `outcome-record.json` read as referring to the existing
   `context/schema/outcome.json`.~~ **Ratified at review: confirmed.**
   `outcome-record.json` is `outcome.json`; no rename, no new file. The plan
   proceeds on that basis with no further flag needed.

4. **Read grant is wide** (whole opportunity + account + all canonical
   context, minus legal) rather than narrow like `call-summary`'s single-glob
   grant. Justified against the existing `a-0001-brief.md` fixture's actual
   citations. Flag if you'd rather narrow it and treat the fixture as
   aspirational/to-be-rewritten instead of load-bearing.

5. **`runSkill`'s generation branch needs generalizing — ratified at review:
   do the work properly, not a narrow call-prep-shaped patch.** Today
   `checkGenerationCitations` and the `SummaryLike` interface in
   `packages/skills/src/runner.ts` are hardcoded to `call-summary`'s exact
   field names (`commitments`/`next_steps`/`context_deltas`/`citations`).
   `call-prep` introduces a second generation-tier skill with different field
   names (`what_we_know`/`talking_points`/`risks`), so this hardcoding cannot
   survive as-is, and a third generation skill (`proposal-draft`, WI-3) is
   already on the roadmap — patching in a second hardcoded shape now would
   just move the same problem to intent 005. The plan implements a real
   generalization: walk the *validated* output object for every array field
   whose items are objects carrying a `citation` (or are themselves a
   `Citation`-shaped `{path, quote, span}`), flatten those, and run
   `resolveCitation` over the union — no per-skill field-name list in
   `runner.ts` at all. This is within the *same kind* of additive extension
   intent 002's Judgment call #1 already established `runSkill` can absorb
   (signature and case→score→gate pipeline unchanged), not a seam violation
   requiring its own tier-2 review — but it is a real rewrite of
   `checkGenerationCitations`, not a two-line hardcode, and the plan should
   size it accordingly. See Open question #4 below for the failure-closed
   requirement this generalization must satisfy.

6. **The `call-prep` rubric ships advisory, not blocking — ratified at
   review, held off explicitly, tracked as a decision to revisit, not
   closed.** Extends intent 002 amendment A1's finding (judge noise,
   token-overlap literalism) to a second generation skill without re-running
   the calibration experiment first. This is a bet that A1's root cause (same
   judge model judging its own family's output; recall scorers too literal
   for paraphrase) generalizes to `call-prep`'s different section shape.
   **Standing follow-up, not resolved by this spec:** revisit whether a
   blocking generation-quality gate is achievable — for `call-prep`,
   `call-summary`, or both — once either a stabler judge setup exists (per
   A1's own candidates: more attempts + a calibrated threshold, an ensemble,
   or a non-token-overlap commitment/claim matcher) or the golden set is
   large enough that a single case doesn't dominate the aggregate. This
   belongs in `HANDOFF.md`'s open-follow-ups list once this spec merges, so
   it isn't silently dropped the way a Judgment call in an already-merged
   spec would otherwise be.

7. **The write grant lives on the skill definition even though the skill impl
   never calls `writeArtifact()` directly** — `runSkill` does, after the
   impl returns. This mirrors `sow-review`'s existing pattern (review skills
   have *no* write grant at all because they don't get one; generation skills
   that persist declare one so the *runner's* write is checkable against a
   declared boundary, and so the skill-definition file stays the single
   source of truth for "what can this skill's execution ultimately touch,"
   even split across impl + runner). Flag if you'd rather the write grant be
   implicit (derived from the fixed artifacts-path convention, no separate
   declaration) since in practice every generation skill's write grant is the
   same one glob pattern.

8. **Artifact id scheme: a monotonic per-opportunity sequence with a
   zero-padded counter derived by listing the existing `artifacts/` directory
   at write time, retried under a `wx`-collision on the target file** —
   resolves the intent's third open question. Matches the existing
   `a-0001`/`a-0002` fixture naming (not a ULID or timestamp scheme, which
   `write-findings.ts`'s `f-<date>-<shortid>` pattern uses for a *different*
   artifact kind, `findings`, precisely because findings needed to be
   collision-safe without a listing step in a review-skill context that has
   no write grant to begin with — that reasoning doesn't apply here, where
   `writeArtifact` unconditionally owns the directory). Collision-safety
   under real concurrency comes from `flag: "wx"` plus a bounded retry
   (re-list, re-mint, re-attempt) on `EEXIST`, not from the id scheme being
   unguessable. Flag if you'd rather match `write-findings.ts`'s
   timestamp-suffix approach for consistency across both write paths instead
   of matching the pre-existing `a-000N` fixture convention — these two
   goals conflict and I chose the fixture.

9. **Eval-harness mutation resolved as "real `writeArtifact()` call against a
   per-suite scratch copy of the corpus," no dry-run mode** — resolves the
   intent's first open question in favor of not adding a mode to
   `writeArtifact()` at all. Flag if you'd rather have an explicit
   `dryRun: true` parameter on `writeArtifact()` itself (testable without any
   filesystem copy, but now a code path in the production function that only
   exists for tests).

## Open questions

Carried from `intent.md`, with this spec's resolution noted:

1. **Dry-run vs. scratch-copy for eval runs** — *resolved* (Judgment #9):
   scratch copy, no dry-run mode. Plan wires `ASH_CONTEXT_ROOT`/`root`
   override into the eval runner's suite setup.
2. **`ArtifactKind` → schema mapping / brief-output shape** — *resolved*
   (Judgment #1): new `brief-output.json`, sectioned by talk track, matching
   the existing fixture. Plan finalizes exact field names against however
   many eval cases it ends up writing.
3. **`<id>` minting scheme** — *resolved* (Judgment #8): sequential
   `a-000N`, directory-listing + `wx`-retry for collision safety. Plan
   confirms the exact padding/prefix and the retry bound.

New, surfaced by this spec:

4. **Does `runSkill`'s citation-flattening generalization (Judgment #5)
   introduce a risk that a future generation skill's output schema, if
   malformed, silently contributes zero citations to the check rather than
   failing loudly?** The plan should make the generalized walker fail closed
   (throw, not skip) if it cannot find an expected array-of-citations shape
   in output that already passed `brief-output.json`/`summary-output.json`
   validation — a schema-valid-but-structurally-unwalkable output should be
   an assertion failure in the runner, not a silent 1.00 on an empty set.
5. **`writeArtifact()`'s template no-op needs a concrete "no-op" contract
   the plan can test** — e.g., does "no-op" mean "the function accepts a
   `templateCheck` step that always returns `{valid: true}` when the
   template file doesn't exist," or does the template-check call site not
   exist at all yet (added in WI-5) and this spec's `writeArtifact()`
   signature has no template parameter whatsoever? This spec assumed the
   latter (simpler, nothing to make inert) but the intent's "How we'll know
   it worked" ("refuses a body missing a required section when an output
   template is present") implies the former — the plan must pick one
   explicitly, since they imply different function signatures.
