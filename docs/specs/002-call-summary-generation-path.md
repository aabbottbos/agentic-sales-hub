# 002 — call-summary generation path

**Tier:** tier:2
**Status:** draft
**Intent:** docs/intent/002-call-summary-generation-path.md

## Summary

Prove the LLM-backed **generation** skill path end-to-end with the lowest-liability,
most-checkable generation skill: `call-summary`. It takes a path to one corpus
meeting note (accumulating context, not `inbound/**`) and returns a structured
object — `{ summary, commitments[], next_steps[], context_deltas[], citations[] }` —
validated against a new `context/schema/summary-output.json` output-contract
schema. It persists nothing this slice (no `writeArtifact`, no `outcomes.jsonl`).
On top of it, stand up a new **generation** eval class: an LLM-judge rubric
(grounding / completeness / tone / structure, aggregate ≥ 4.0/5), plus two
deterministic scorers — citation validity (= 1.00) and commitment recall (≥ 0.90) —
with the judge prompt, judge model ID, and rubric committed to the repo. The
`SkillImpl` seam and the `SkillDefinition` schema do not change; `runSkill` and
the eval runner gain a `generation` branch alongside their existing `retrieval`
and `review` branches (a contract *extension*, not a signature change — see
Judgment calls #1).

## Context model impact

- **Schema changes:**
  - **New:** `context/schema/summary-output.json` — an **output-contract** schema
    (like `retrieval-result.json` / `finding.json`), not a file-on-disk schema.
    It validates the object `call-summary` returns. It is added to the
    published-spec set and to `context/schema/README.md`'s "output-contract
    schemas" note. Draft shape:

    ```jsonc
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://agentic-sales-hub.dev/schema/summary-output.json",
      "title": "Call summary (call-summary output contract)",
      "description": "OUTPUT-CONTRACT schema: validates the call-summary skill's structured return, not a file on disk.",
      "type": "object",
      "properties": {
        "summary": { "type": "string", "minLength": 1 },
        "commitments": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": { "type": "string", "minLength": 1 },
              "owner": { "enum": ["us", "counterparty", "unknown"] },
              "citation": { "$ref": "#/$defs/citation" }
            },
            "required": ["text", "owner", "citation"],
            "additionalProperties": false
          }
        },
        "next_steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": { "type": "string", "minLength": 1 },
              "owner": { "enum": ["us", "counterparty", "unknown"] },
              "citation": { "$ref": "#/$defs/citation" }
            },
            "required": ["text", "owner", "citation"],
            "additionalProperties": false
          }
        },
        "context_deltas": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "field": {
                "enum": ["stage", "close_date", "amount", "champion", "risk", "competitor", "other"]
              },
              "observation": { "type": "string", "minLength": 1 },
              "citation": { "$ref": "#/$defs/citation" }
            },
            "required": ["field", "observation", "citation"],
            "additionalProperties": false
          }
        },
        "citations": {
          "type": "array",
          "items": { "$ref": "#/$defs/citation" }
        },
        "unsourced_claims": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 }
        }
      },
      "required": ["summary", "commitments", "next_steps", "context_deltas", "citations"],
      "additionalProperties": false,
      "$defs": {
        "citation": {
          "type": "object",
          "properties": {
            "path": { "type": "string", "minLength": 1 },
            "span": {
              "type": "array",
              "prefixItems": [
                { "type": "integer", "minimum": 0 },
                { "type": "integer", "minimum": 0 }
              ],
              "minItems": 2,
              "maxItems": 2
            }
          },
          "required": ["path", "span"],
          "additionalProperties": false
        }
      }
    }
    ```

    The plan stage finalizes exact field names and enum members; what this spec
    fixes is: (a) it is an output-contract schema, not a disk schema; (b) every
    `commitment`, `next_step`, and `context_delta` carries a `citation` object of
    `{path, span}`; (c) `unsourced_claims[]` exists and is the *only* sanctioned
    way to surface a claim with no resolvable source (invariant #4); (d)
    `additionalProperties: false` throughout.

  - **Not touched:** `context/schema/artifact.json`. It already reserves
    `kind: "summary"`, `citations[]`, and `unsourced_claims[]` for a future
    persisted summary artifact — that is WI-2's `writeArtifact` path, not this
    slice. `summary-output.json` is deliberately a *separate, narrower* contract
    for the in-memory return; the two converge in WI-2.

- **Mutability class of touched context:**
  - Input is **accumulating** context — a `context/accounts/*/opportunities/*/meetings/*.md`
    file. `call-summary` reads it; it does not write, supersede, or delete it.
  - Any new corpus meeting notes this spec adds (see Eval impact) are
    **accumulating** and ship `fictional: true` in the `acme-` namespace.
  - This slice creates **no** accumulating writes. `context_deltas[]` is
    *returned*, not applied — applying a delta to `opportunity.md` frontmatter is
    a later capability (WI-2+).

- **Provenance / citation requirements:**
  - Every material claim in `summary` and every entry in `commitments[]`,
    `next_steps[]`, `context_deltas[]` must carry a resolvable citation into the
    input meeting note (or another in-scope context file). A claim with no
    resolvable source is listed in `unsourced_claims[]` and marked `[unsourced]`
    inline in `summary` — never asserted bare (invariant #4, amendment §14).
  - Citation validity is **deterministic** and gated at = 1.00: every `{path, span}`
    in `citations[]` and in every commitment / next_step / context_delta must
    `resolveCitation` against the loader. This reuses the existing
    `scoreRetrievalCitations` resolve-path (resolvability only — there is no
    `position` to verify for a generation artifact).

## Skill contract

- **Tier:** generation
- **Output contract:** a single markdown-bearing structured object (the `summary`
  field is prose; the rest is structured) + citation map + `unsourced_claims[]`
  markers, validated against `context/schema/summary-output.json`. Evaluated by
  rubric score + citation validity (every citation resolves).

- **Draft YAML skill definition** (`packages/skills/src/definitions/call-summary.yaml`):

  ```yaml
  id: call-summary
  tier: generation
  version: 1
  description: >-
    Summarize one sales meeting note into a structured call summary — a prose
    recap plus extracted commitments, next steps, and opportunity context
    deltas, each carrying a resolvable citation into the note. Claims with no
    source are marked [unsourced], never asserted. Returns a structured object;
    a separate step (WI-2) persists it.
  context_grants:
    read:
      - context/accounts/*/opportunities/*/meetings/**
    # no write grant — see Context grants
  inputs:
    meeting_path:
      type: string
      required: true
  output:
    schema: context/schema/summary-output.json
    requires_citations: true
  eval_suite: evals/cases/call-summary/
  tools:
    - context.read
  ```

  Notes on the definition:
  - `inputs` has exactly one member, `meeting_path` — a repo-relative path to a
    `meetings/**` file. `runSkill`'s `validateInput` already rejects unknown
    inputs and enforces `required`; no runner change needed for input validation.
  - `tools` is `[context.read]` only. No `context.search` (the job is
    single-document; scope is fully computable from the path), no `artifact.write`
    (no persistence this slice).
  - `requires_citations: true` — drives the `runSkill` generation branch to run
    the deterministic citation check.
  - The `SkillDefinition` JSON Schema (`packages/skills/src/skill-def.schema.json`)
    already permits `tier: generation` and this exact shape. **No schema change.**

## Context grants

- **Read scope:** `context/accounts/*/opportunities/*/meetings/**`. Justification:
  `call-summary`'s entire job is "summarize *this* meeting note." It needs the
  note and nothing else — not org context, not legal, not other opportunities,
  not the account's other meetings. The grant is deliberately one glob. Scope is
  narrowed at call time to the single opportunity via the existing
  `scopeParams` / `resolveScope` mechanism (`accountSlug` + `oppId` derived from
  `meeting_path`), and `runSkill`'s post-hoc check already fails the run if the
  impl reads any file outside the resolved scope.
  - **Considered and rejected for this slice:** granting `opportunity.md` read so
    `context_deltas[]` can be diffed against current opportunity state. Rejected
    because (a) it widens the grant for a feature (delta *application*) that is
    explicitly WI-2+, and (b) `context_deltas[]` as *observations extracted from
    the note* needs only the note. Flag in Judgment calls #4 if you want the
    wider grant now.
- **Write scope:** none — **omitted entirely from the definition.** Rationale:
  this slice persists nothing (intent constraint #4). Generation skills *may*
  carry a write grant in general (the skill-contract table allows
  `artifact.write`), but `call-summary` v1 does not, and `tools` omits
  `artifact.write` to match. When WI-2 adds `writeArtifact`, that is a
  `version: 2` bump of this definition with its own tier-2 chain.

## Security considerations

- **Does this touch `inbound/**`?** **No.** The input is an *accumulating*
  meeting note under `context/accounts/*/opportunities/*/meetings/**` — first-party
  content authored by the seller, not counterparty-supplied. `call-summary` does
  **not** call `readInbound`, has no `inbound/**` glob in its read grant, and the
  `SkillDefinition` schema's `read` pattern (`^context/`) plus `resolveScope`
  keep it that way. The quarantine hook and taint ledger are not in this skill's
  path.
  - **Caveat the plan must honor:** a meeting note can *quote* counterparty
    statements ("they said they need SOC 2 by Q1"). That quoted text is still
    first-party context (the seller's transcription), not a live `inbound/**`
    document, and is treated as data the same way any note body is. `call-summary`
    does not fetch, follow, or execute anything from the note body — it
    summarizes it. No new quarantine surface.
- **New attack surface introduced:**
  1. **A live model call in the skill path and in CI.** `call-summary`'s impl
     calls a foundation-model API (`@anthropic-ai/sdk`, pending OQ1). This adds:
     an API key in CI secrets (`ANTHROPIC_API_KEY`), a network egress in the eval
     job, and non-determinism in the skill output. Mitigations: (a) the API key
     is a GitHub Actions secret, never in the repo, and `gitleaks` already gates
     that; (b) the model call is behind a **single seam function**
     (`packages/skills/src/impl/llm.ts` or similar) so there is one place to
     audit, stub, or rate-limit; (c) the eval job pins the model ID and runs with
     a low temperature / fixed seed where the API supports it, and the rubric
     gate has a tolerance band + retry policy (see Eval impact).
  2. **Prompt content assembled from context.** The impl builds a prompt from the
     meeting-note body. Because the note is first-party accumulating context (not
     `inbound/**`), it is not wrapped in untrusted delimiters — but the plan
     should still assemble the prompt so the note body is clearly delimited as
     "the document to summarize," to keep the door closed if a future version
     ever accepts a less-trusted input.
  3. **The judge prompt + judge model** become part of the eval trust base. They
     are committed to the repo (`evals/judge/`), versioned, and changing them is
     itself an eval-gate change (tier:2). A compromised judge prompt could pass a
     bad summary — mitigated by the judge prompt being in-repo and PR-reviewed,
     and by the two deterministic gates (citation validity, commitment recall)
     that no judge-prompt change can weaken.
- **Standing disclaimer:** `call-summary` output is an internal work product
  (a meeting recap), not review output and not legal advice — the `sow-review`
  disclaimer does not apply. No new disclaimer is required, but the plan should
  confirm the generated `summary` does not present itself as authoritative record
  over the raw note (the note remains the source of truth).

## Non-goals / out of scope

`call-summary` in this slice explicitly does **not**:

- **Persist anything.** No `writeArtifact`, no `artifact.json` file on disk, no
  `outcomes.jsonl` entry. The return is in-memory only. (→ WI-2.)
- **Apply `context_deltas[]`** to `opportunity.md` or any frontmatter. Deltas are
  *reported observations*, not mutations. (→ WI-2+.)
- **Build the MCP server** (`packages/mcp-agentic-sales-hub`) or emit a trace
  beyond the existing `TraceEntry[]` the `SkillImpl` already returns. (→ WI-4.)
- **Implement `call-prep` or `proposal-draft`.** (→ WI-2, WI-3.)
- **Add a second opportunity or the spec §10 corpus expansion.** Scope-fenced:
  this spec may add **≤ 2** new `acme-logistics` meeting notes and nothing else.
  (→ WI-4.)
- **Make the model swappable by an adopter.** Model portability across
  foundation-model vendors is an **explicit v1 non-goal** (OQ1 resolved below).
  The eval gates are calibrated against one skill model + one judge model; a
  user-swappable model invalidates the golden-set scores.
- **Change the `SkillImpl` interface or the `SkillDefinition` schema.** If either
  needs to change to hold an LLM impl, that is a finding, not a workaround
  (intent constraint #6).

**Reverses a standing non-goal?** **No.** The product-level non-goals from the v2
spec (multi-tenant SaaS, auth, billing, CRM sync, dashboards, MSA/SOW/proposal
*generation-as-a-product*, e-signature, publishing/hosting, mobile, real-time
collab, notifications, "output is legal advice") all remain intact. `call-summary`
generates an *internal meeting recap*, which is squarely inside the product's
stated job ("the layer between 'we have a meeting' and 'we have signed paper'")
and is not "SOW generation" or "proposal publishing." One item is *narrowed but
not reversed*: v1 non-goal "model portability" is explicitly re-affirmed as a
non-goal here (OQ1), not opened.

## Eval impact

- **New eval suite:** `evals/cases/call-summary/` — the generation-class golden
  set. Each case is a `.case.json` referencing one meeting note plus a labeled
  expectation file:
  - `input: { meeting_path }`
  - `scope_params: { account_slug, opp_id }`
  - `expected_commitments_ref` → a JSON file of labeled commitments/next-steps a
    competent reader must extract (drives commitment recall).
  - `rubric_ref` (optional per-case rubric notes) — the shared rubric lives in
    `evals/judge/rubric.md`.
  - Minimum set: the **3 existing** `acme-logistics` meeting notes
    (`2026-07-14-discovery`, `2026-08-05-demo`, `2026-08-28-negotiation`) as
    cases. The plan MAY add **≤ 2** new `acme-` notes if 3 is too thin to
    calibrate the rubric (Judgment calls #3 + intent OQ4 scope fence).

- **New scorers** (`evals/scorers/`):
  - `generation.ts` → `scoreCommitmentRecall(produced, labeled)` — deterministic.
    A labeled commitment is "covered" if a produced `commitments[]` (or
    `next_steps[]`) entry matches it by the same fuzzy-match approach
    `scoreReview`/`covers` already use (normalized substring / token overlap; the
    plan sets the threshold). Recall = covered / labeled. **Gate ≥ 0.90.**
  - Citation validity reuses `scoreRetrievalCitations` (resolve-only) over the
    flattened citation list (`citations[]` ∪ every commitment / next_step /
    context_delta `.citation`). **Gate = 1.00.**
  - `judge.ts` → `scoreRubric(summaryOutput, meetingNote, rubric)` — calls the
    **judge model** with the committed judge prompt, returns per-dimension scores
    (grounding, completeness, tone, structure) 1–5 and an aggregate. **Gate:
    aggregate ≥ 4.0/5.**

- **New judge harness** (`evals/judge/`):
  - `rubric.md` — the four dimensions with a 1–5 scale and anchor descriptions
    for each score (the plan writes the anchors; the *dimensions* are fixed here).
  - `judge-prompt.md` — the exact prompt template, committed.
  - `judge-model.json` — `{ "model": "<id>", "temperature": 0, ... }`, committed.
  - Reproducibility: `pnpm eval --suite call-summary` run twice must produce a
    rubric aggregate within a **documented tolerance band** (the plan sets the
    band — first cut ±0.3) and a **retry policy** (first cut: up to 3 attempts,
    take the median; hard-fail if median < 4.0, not skip-with-warning — see
    OQ2 resolution).

- **Eval runner extension** (`evals/runner/`):
  - `run-suite.ts` gains `runGenerationSuite()` alongside `runReviewSuite()` /
    `runRetrievalSuite()`, and `SuiteName` / `ALL_SUITES` gain `"call-summary"`.
    This is an **additive** change to a hardcoded union — the intent's "no change
    to the eval harness *shape*" holds in the sense that the case→run→score→gate
    pipeline and the `CaseResult` / `SuiteResult` types are unchanged; a new
    suite function is how every suite is added. Flag in Judgment calls #1 if this
    counts as "changing the harness" for your review.
  - `report.ts` / `compare.ts` already iterate suites and metrics generically —
    no change expected beyond the new suite appearing in output.

- **`runSkill` extension** (`packages/skills/src/runner.ts`):
  - The output-contract `switch` currently has `retrieval` and `review` branches
    and silently no-ops for any other tier. Add a `generation` branch that: (a)
    validates the output against `summary-output.json`, and (b) if
    `def.output.requires_citations`, runs the deterministic resolve-only citation
    check and sets `citationsValid`. **This is a contract extension, not a
    signature change** — `runSkill`'s parameters and return type are untouched.
    Judgment calls #1.
  - **No `context-core` change (OQ5 resolved).** `loadSchemas` already
    auto-discovers every `context/schema/*.json` and keys it by `$id` basename,
    so `summary-output.json` is loadable through `ctx.loader.registry.get(...)`
    the moment the file exists — but the generation branch validates against the
    **raw JSON Schema file directly** (compiled once in `packages/skills`), *not*
    by adding `"summary-output"` to `context-core`'s `SCHEMA_TYPES` tuple or
    adding a loader assertion method. This keeps the intent's "not touched:
    `packages/context-core`" literally true, at the cost of a small asymmetry
    with how `finding` / `retrieval-result` are wired (those go through the
    registry + a loader method). The plan owns where the compiled validator
    lives. If a later slice wants the registry route, that is its own change.
  - `IMPLS` in `runner.ts`, `PRODUCT_SKILL_IDS` in `types.ts`, and the
    `sync-claude-skills.ts` filter all gain `"call-summary"`. `skills:check` must
    stay green (a generated `.claude/skills/call-summary/SKILL.md` is committed;
    the generator's `renderSkillMd` already handles non-review tiers).

- **CI** (`.github/workflows/evals.yml`):
  - The workflow already triggers on `packages/skills/**`, `evals/**`,
    `context/**`, `CLAUDE.md`. It gains: an `ANTHROPIC_API_KEY` env from
    `secrets.ANTHROPIC_API_KEY` on the eval step, and the model call runs as part
    of `pnpm eval --suite all`.
  - **Flaky-judge gating (OQ2 resolution):** the `call-summary` rubric runs on
    the **critical path** (same job), with the retry-median policy above.
    Rationale: a generation gate that is "skip-with-warning" is not a gate. If
    API flakiness proves disruptive in practice, a fast-follow can move it to a
    `continue-on-error` shadow job — but it ships blocking.
  - Forked-PR contributors have no secret access → the eval job's rubric step is
    conditioned on the secret being present; absent it, the job **fails closed**
    with a clear message ("rubric gate needs ANTHROPIC_API_KEY; a maintainer must
    re-run"), not silently passes. Solo project today, so this is a
    forward-looking guard.

- **Gates this must clear (the full set for a green PR):**
  - `call-summary`: **rubric aggregate ≥ 4.0/5**; **citation validity = 1.00**
    (deterministic); **commitment recall ≥ 0.90** (deterministic).
  - **No net regression** vs. `evals/results/2026-09-07-434b594.json` (or newer
    at merge time): `sow-review` blocker recall = 1.00, precision ≥ 0.70,
    citation validity = 1.00, `injection: PASS`; `find-evidence` recall ≥ 0.90,
    citation validity = 1.00.
  - `pnpm corpus:validate` — any new meeting notes validate against
    `meeting.json` with zero errors; `summary-output.json` is well-formed JSON
    Schema and loads in the registry.
  - `check:no-real-data` + `gitleaks` — zero findings (new notes are `acme-`,
    `fictional: true`; no API key in the tree).
  - A committed `call-summary` result lands in `evals/results/` from the CI run.

- **Every future `call-summary` production defect becomes a permanent case in
  `evals/cases/call-summary/`** (standing rule).

## Judgment calls for review

Start here. Each is something the intent left open or that policy/code forced a
decision on:

1. **"No change to `runSkill` / the eval harness" is interpreted as "no change to
   *signatures, types, and the case→score→gate pipeline*", NOT "zero new code."**
   `runSkill` gets a `generation` branch in its output-contract switch;
   `run-suite.ts` gets a `runGenerationSuite()` and two new union members. Both
   are the *same kind* of additive extension every existing tier already required.
   The intent's success criterion #1 ("no change to `skill-def.schema.json`,
   `runSkill`'s signature, or the eval harness interfaces") is met on that
   reading. **Flag if you consider a new switch branch / suite function a seam
   violation** — if so, the seam claim in the intent needs rewording, not the
   code. *Cold review: accepted this reading.* Also confirmed at cold review:
   `packages/context-core` stays untouched — the generation branch validates
   against the raw `summary-output.json` file, not via `SCHEMA_TYPES` (OQ5).

2. **`summary-output.json` is a new, separate output-contract schema — NOT a
   reuse of `artifact.json`.** `artifact.json` already has `kind: "summary"` and
   the citation shape, but it is a *disk* schema for a *persisted* artifact, and
   this slice persists nothing. Two contracts now, converging in WI-2. Flag if
   you'd rather `call-summary` return an `artifact.json`-shaped object from day
   one (it would couple this slice to the WI-2 write-path schema decisions).

3. **Golden set = the 3 existing Acme notes, with the plan free to add ≤ 2 more.**
   The intent's scope fence permits ≤ 2 new `acme-` notes; this spec does not
   pre-commit to adding them, leaving it to the plan once the rubric is being
   calibrated. Flag if you want a hard "3 only" or a hard "add exactly 2."

4. **`call-summary` read grant is `meetings/**` only — no `opportunity.md`.**
   `context_deltas[]` are extracted *from the note*, not diffed against current
   opportunity state, so the note alone suffices. Flag if you want `opportunity.md`
   in the grant now (wider grant, enables delta-vs-state diffing a slice early).

5. **`context_deltas[]` gets a structured shape now** (`{field, observation,
   citation}` with a small `field` enum), not a free-text list (intent OQ3). A
   later step (WI-2) can act on `field` mechanically; a free-text list would have
   to be re-parsed. Cost: the enum is a guess the plan/corpus may need to adjust.
   Flag if you'd rather ship a labeled free-text list and structure it in WI-2.

6. **OQ1 resolved: `@anthropic-ai/sdk` direct, one seam function, model
   portability is a v1 non-goal.** Recorded in Non-goals. The seam
   (`impl/llm.ts`) stays narrow so a later adapter is possible without a
   rewrite. Flag only if you want the Claude Agent SDK instead (it pulls in
   OAuth-token CI auth and a heavier dependency for no benefit this slice).

7. **OQ2 resolved: rubric runs blocking, on the critical path, retry-median (3
   attempts, median), hard-fail below 4.0, `ANTHROPIC_API_KEY` GitHub secret.**
   Not skip-with-warning. Fast-follow to a shadow job only if flakiness proves
   disruptive. Flag if you want it non-blocking for the first N runs while the
   rubric stabilizes.

8. **Citation validity for generation = resolve-only** (does the `{path, span}`
   point at real text?), reusing `scoreRetrievalCitations`. Unlike `sow-review`
   there is no `position` to verify. A *semantic* "does the cited span actually
   support the claim" check is left to the **rubric's grounding dimension**
   (LLM-judged), not the deterministic gate. Flag if you want a deterministic
   claim↔span support check too (hard to do without an LLM; would blur the
   deterministic/judged split the intent asks for in constraint #7).

9. **Directory convention:** filed at `docs/specs/002-call-summary-generation-path.md`
   to match the existing `docs/specs/` dir and the `docs/intent/` (singular)
   intent. The `write-spec` skill text says `docs/intents/` / `docs/specs/`; the
   repo uses `docs/intent/` / `docs/specs/`. Following the repo. (Same call as
   spec 001 Judgment #8 — still unresolved whether to rename `docs/intent/`.)

## Open questions

Carried from `intent.md`, with this spec's resolution noted:

1. **SDK / model API** — *resolved* (Judgment #6): `@anthropic-ai/sdk` direct,
   single seam, portability is a non-goal. Plan confirms the package version and
   the seam file location.
2. **CI auth + flaky-judge gating** — *resolved* (Judgment #7): `ANTHROPIC_API_KEY`
   secret; blocking; critical path; retry-median (3, median, hard-fail < 4.0).
   Plan sets the exact tolerance band (first cut ±0.3) and the median/attempt
   numbers.
3. **`context_deltas[]` shape** — *resolved* (Judgment #5): structured
   `{field, observation, citation}` with a `field` enum. Plan finalizes the enum
   members against what the 3 (–5) notes actually contain.
4. **Golden-set sufficiency** — *partially resolved* (Judgment #3): start with
   the 3 existing Acme notes; plan may add ≤ 2 `acme-` notes during rubric
   calibration; anything beyond kicks to WI-4.

New, surfaced by this spec:

5. **Does a `"summary-output"` schema type need to be a first-class member of
   `context-core`'s `SCHEMA_TYPES` / registry?** — *resolved (cold review):* **no.**
   `runSkill`'s generation branch validates against the raw `summary-output.json`
   JSON Schema file directly (compiled in `packages/skills`), *not* via
   `context-core`'s `SCHEMA_TYPES` tuple or a new loader method. `finding` /
   `retrieval-result` go through the registry today; `summary-output` deliberately
   does not, so the intent's "not touched: `packages/context-core`" holds. The
   plan owns where the compiled validator lives and the small wiring asymmetry
   that results. Revisiting the registry route is a later slice's call.

6. **Rubric anchor calibration is circular until an impl exists.** The rubric's
   1–5 anchor text can only be finalized by running a real `call-summary` output
   past the judge and adjusting. The plan should sequence this: land the schema +
   skeleton impl + deterministic scorers first, then calibrate the rubric against
   real output, then set the tolerance band from observed variance. The 4.0 gate
   itself is fixed; the anchors and band are calibrated.

7. **Meeting-note body offsets for citations.** `citations[]` spans are byte
   offsets into the meeting-note *file* (including frontmatter) vs. the *body*
   only. `sow-review` cites into clause files by raw-file offset;
   `resolveCitation` presumably expects file offsets. The plan must pin which,
   and the impl must produce offsets that `resolveCitation` accepts — this is the
   most likely source of a citation-validity < 1.00 failure.
