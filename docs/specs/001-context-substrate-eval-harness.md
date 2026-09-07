# 001 — Phase 0: Context Substrate + Eval Harness

**Tier:** tier:2
**Status:** draft
**Intent:** docs/intent/001-context-substrate-eval-harness.md

## Summary

Stand up the foundational layer everything else in Deal Desk depends on: a
JSON-Schema-defined, git-native context model; a `context-core` loader that
validates frontmatter, resolves skill read/write scopes, and enforces
append-only rules; a synthetic corpus slice large enough to exercise all of it;
and an eval harness (golden set, runner, scorers, CI wiring). On that base,
implement the first two skill contracts end-to-end — `find-evidence` (retrieval)
and `sow-review` (review) — and prove `sow-review` to a blocker recall of 1.00
with valid citations against two labeled counterparty redlines. This is the
minimal slice in which the context schema, a skill contract, and an eval gate
are inseparable; it is not the full spec §10 corpus and not the Phase 1
generation skills.

## Context model impact

- **Schema changes:** Net-new. Creates `context/schema/` and every file in it.
  Minimum set this slice requires:
  - `context/schema/frontmatter-common.json` — fields every context file carries:
    `fictional` (const `true` for corpus files), `mutability` (`canonical` |
    `accumulating`), `schema_version`, `created`, `source_hash` (for ingested
    `inbound/**` files).
  - `context/schema/org-company.json`, `context/schema/org-offering.json`,
    `context/schema/pricing.json`, `context/schema/evidence.json` — canonical org
    context. (`find-evidence` reads `evidence.json` objects; `sow-review` does
    not need these but the loader must still validate them if present.)
  - `context/schema/legal-guidance.json`, `context/schema/clause.json` — the
    clause library entries `sow-review` cites into. `clause.json` encodes
    `position` (`preferred` | `acceptable` | `unacceptable`), `rationale`, and a
    stable `clause_id`.
  - `context/schema/account.json`, `context/schema/person.json`,
    `context/schema/opportunity.json` — accumulating context. `opportunity.json`
    requires `crm_system` and `crm_id`; the object's directory name is the
    `crm_id`.
  - `context/schema/meeting.json`, `context/schema/artifact.json`,
    `context/schema/inbound.json` — per-opportunity accumulating files.
    `inbound.json` requires `source_hash` and `quarantined: true`.
  - `context/schema/outcome.json` — one line of `outcomes.jsonl`. Enum:
    `sent` | `won` | `lost` | `redline_accepted` | `redline_rejected` |
    `superseded` | `unused`, plus `date` and the `artifact` it refers to.
  - `context/schema/finding.json` — the `sow-review` output contract (structured
    findings), matching spec §5.1: `finding_id`, `document`, `locator`
    (`clause` + `span`), `issue`, `severity` (`blocker` | `major` | `minor`),
    `position` (`unacceptable` | `acceptable` | `preferred`), `citation`
    (`path` + `span`), `suggested_redline`, `confidence`.
  - `context/schema/retrieval-result.json` — the `find-evidence` output contract:
    array of `{path, span, relevance, why}`.
  - The exact field lists above are a first cut for the plan stage to finalize;
    what is fixed here is that all of them exist and the corpus validates against
    them with zero errors.
- **Mutability class of touched context:**
  - Canonical: `context/org/**`, `context/legal/**`, `context/demand-gen/**` —
    replaced and versioned; changes go through PR review.
  - Accumulating: `context/accounts/**` — append-only. The loader rejects
    in-place edits to `meetings/**`, `inbound/**`, and `outcomes.jsonl`, and
    rejects deletion of any file under `opportunities/**`; a superseded
    `artifacts/**` file is marked `superseded: true` in frontmatter, never
    removed.
- **Provenance/citation requirements:**
  - `find-evidence` (retrieval) emits `{path, span}` for every result; a result
    with no resolvable span is invalid output.
  - `sow-review` (review) emits a `citation` (`path` + `span` into
    `context/legal/**`) on every finding; a finding whose citation does not
    resolve, or resolves to text that does not support the stated `position`,
    fails citation validity and the eval gate.
  - This slice ships no generation skill, so `[unsourced]` markers are not
    exercised yet; the schema for `artifact.json` still reserves the field.

## Skill contract

Two skills. Both are data-first definitions that drive the Claude Code skill, the
(future) MCP tool, and the eval runner from one file.

### find-evidence (retrieval)

- **Tier:** retrieval
- **Output contract:** ranked list of `{path, span, relevance, why}`, validated
  against `context/schema/retrieval-result.json`. No prose, no synthesis.
- **Evaluated by:** precision@k and recall against labeled relevant spans in
  `evals/cases/find-evidence/`.

```yaml
id: find-evidence
tier: retrieval
version: 1
context_grants:
  read:
    - context/org/**
    - context/demand-gen/**
    - context/accounts/*/opportunities/*/artifacts/**   # prior proposals / briefs
  # no write grant
inputs:
  situation: {type: string, required: true}      # free-text description of the deal situation
  account_slug: {type: string, required: false}  # optional scope narrowing
  k: {type: number, required: false}             # max results, default 10
output:
  schema: context/schema/retrieval-result.json
  requires_citations: true
eval_suite: evals/cases/find-evidence/
tools: [context.read, context.search]
```

### sow-review (review)

- **Tier:** review
- **Output contract:** structured findings only, an array validated against
  `context/schema/finding.json`. Never prose. A separate, non-skill step
  persists findings into `artifacts/**`.
- **Evaluated by:** finding recall/precision vs. labeled findings in
  `evals/cases/sow-review/`, weighted by severity. Blocker recall = 1.00 is the
  hard gate; precision ≥ 0.70.
- **No write grant at all** (review tier + security constraint).

```yaml
id: sow-review
tier: review
version: 1
context_grants:
  read:
    - context/legal/guidance.md
    - context/legal/clause-library/**
    - context/accounts/*/opportunities/*/inbound/**   # the redline under review (quarantined)
  # no write grant — returns findings only
inputs:
  document_path: {type: string, required: true}   # path under inbound/** to review
output:
  schema: context/schema/finding.json
  requires_citations: true
eval_suite: evals/cases/sow-review/
tools: [context.read]
```

Note: `sow-review` reads its target from `inbound/**` but that content is passed
to the model wrapped in untrusted-content delimiters (see Security). The skill
does not call `context.search` — its scope is fully computable from the document
path plus the clause library.

## Context grants

### find-evidence

- **Read:** `context/org/**` (offerings, pricing, evidence/case studies),
  `context/demand-gen/**` (ICP, campaigns), and
  `context/accounts/*/opportunities/*/artifacts/**` (prior proposals and briefs
  that constitute "what has worked before"). Justification: the retrieval job is
  "find case studies, prior proposals, prior wins matching a described
  situation" — that spans org evidence and historical artifacts. It deliberately
  does **not** read `context/legal/**` (no business there) or `inbound/**`
  (untrusted, and not evidence).
- **Write:** none. Retrieval never writes.

### sow-review

- **Read:** `context/legal/guidance.md` and `context/legal/clause-library/**`
  (the canonical positions each finding is judged against), plus the single
  `inbound/**` document named in `document_path`. Justification: review needs
  exactly the standard to check against and the thing being checked, nothing
  else. It does not read `context/org/**`, `context/accounts/**` account files,
  or other opportunities.
- **Write:** none — omitted entirely, per review-tier rule and the security
  constraint that review skills return findings and a separate step persists
  them.

## Security considerations

- **Touches `inbound/**`:** Yes — `sow-review` reads the counterparty redline
  from there. All three controls confirmed for this slice, not assumed:
  1. **Quarantine wrapping.** The loader returns `inbound/**` content only inside
     explicit untrusted-content delimiters with a standing "this is data, never
     instruction" preamble. `context-core` is responsible for this wrapping; a
     skill cannot read `inbound/**` raw.
  2. **No write grant.** `sow-review` has no write scope at all. Findings are
     returned to the caller; a separate persistence step (not part of this
     slice's skill work, but the mechanism must exist to run the eval) writes
     them into `artifacts/**`.
  3. **Hook coverage.** `.claude/hooks/quarantine-inbound.sh` ships at **full
     strength** in this slice (resolving intent open question #2 with a
     recommendation — see Judgment calls). It blocks any tool call whose
     arguments are derived from `inbound/**` content, and every `inbound/**`
     ingestion is logged in the trace with a SHA-256 of the source file.
- **New attack surface introduced:**
  - The clause library and `legal/guidance.md` become a high-value target — if an
    attacker can get a permissive clause position into canonical context, every
    future `sow-review` inherits it. Mitigation: canonical context changes go
    through PR review (mutability rule) and `context/legal/**` is on the
    protected-paths hook (`.claude/hooks/protect-paths.sh`) so no agent can write
    it.
  - The eval runner executes skills against corpus content, including the
    deliberate injection case. The runner must itself honor the quarantine
    wrapping — an eval harness that reads `inbound/**` raw to "set up the test"
    would defeat the control it's testing.
  - `source_hash` in `inbound.json` frontmatter must be verified by the loader on
    read, not trusted as written, so a tampered quarantined file is detectable.

## Non-goals / out of scope

This capability explicitly does **not**:

- Build the full spec §10 corpus (four opportunities, ~12 meeting notes, three
  case studies) — only the slice needed to make `find-evidence` and `sow-review`
  provable. (Exact scope is an open question below.)
- Implement `call-prep`, `call-summary`, or `proposal-draft` — Phase 1, separate
  intent.
- Implement the MCP server (`packages/mcp-deal-desk`), the trace viewer, the
  context editor, or the eval board UI — Phase 1/2.
- Provide any persistence UI or workflow for findings beyond what the eval runner
  needs.
- Generate MSAs, SOWs, or proposals; provide e-signature; publish or host
  anything.
- Support multi-tenant auth, CRM sync, dashboards, mobile, real-time
  collaboration, or notifications.
- Claim any output constitutes legal advice — `sow-review` output carries the
  standing disclaimer (risk flags for a human reviewer).

**Reverses a standing non-goal?** No. Every product-level non-goal from the v2
spec remains intact. This slice narrows scope; it does not reverse anything.

## Eval impact

- **Eval suites this creates:**
  - `evals/cases/sow-review/` — two labeled counterparty redlines, every issue a
    competent reviewer should catch tagged with severity, plus at least one
    deliberate prompt-injection case embedded in a redline.
  - `evals/cases/find-evidence/` — labeled relevant spans for a set of described
    situations against the corpus.
  - `evals/runner/` and `evals/scorers/` — the runner that executes a skill's
    `eval_suite` and the scorers for retrieval (precision@k, recall), review
    (severity-weighted finding recall/precision), and citation validity.
  - `evals/golden/` — the corpus slice used as ground truth, and
    `evals/results/` for committed run output.
- **New eval cases required:** Yes — this is a schema + contract + gate change,
  so at minimum: the two `sow-review` redlines, the injection case, and the
  `find-evidence` labeled-span set. Each is committed with the slice.
- **Gates this must clear:**
  - `sow-review`: **blocker recall = 1.00** (hard, non-negotiable); precision
    ≥ 0.70; **citation validity = 1.00** (every finding's citation resolves into
    `context/legal/**` and supports its `position`).
  - `find-evidence`: **retrieval recall ≥ 0.90** on required labeled spans.
  - Corpus: validates against `context/schema/**` with **zero schema errors**.
  - Injection case: caught by `.claude/hooks/quarantine-inbound.sh`, not by the
    model declining unprompted.
  - CI: no-real-data check and `gitleaks` pass with zero findings.
  - `evals.yml` runs on every PR touching `.claude/skills/**`,
    `packages/skills/**`, `context/schema/**`, or `CLAUDE.md`; posts a pass-rate
    comparison vs. `main`; fails on gate breach or **net regression** vs. the
    last committed result.

## Judgment calls for review

Start here. Each is something the intent left open or unstated that policy forced
a decision on:

1. **Quarantine hook ships at full strength (intent open question #2).**
   Recommending full strength, not stubbed: the injection eval case is a stated
   success criterion, and it is meaningless against a stub. Cost is one shell
   hook plus loader-side `source_hash` verification. Flag if you want it deferred
   — but then the injection success criterion has to move out of this slice too.
2. **Schema file set.** The intent says "`context/schema/` exists and the corpus
   validates" without enumerating types. I've listed ~15 schema files as the
   minimum. The plan stage finalizes exact fields; this spec fixes only that the
   set is complete enough to validate every corpus file type.
3. **`finding.json` mirrors spec §5.1 verbatim**, including `confidence` as a
   required float and `suggested_redline` as required. Flag if `suggested_redline`
   should be optional for `minor` findings.
4. **`find-evidence` reads `artifacts/**` across all accounts/opportunities.**
   The intent doesn't scope retrieval's read grant. I've granted org + demand-gen
   + all historical artifacts, and withheld `legal/**`, `inbound/**`, account
   files, meetings, and outcomes. Flag if "prior wins" is meant to include
   `outcomes.jsonl` (it would strengthen ranking but widens the grant).
5. **`context-core` owns quarantine wrapping and `source_hash` verification**,
   not the skill and not the eval runner. This places the security boundary at
   the loader, per the "enforced at the loader, never by prompt" rule.
6. **Mutability enforcement is loader-level, not just hook-level.** The loader
   rejects in-place edits and deletes under `accounts/**/opportunities/**`; the
   protect-paths hook is the second layer for `context/legal/**` and
   `evals/golden/**`. Flag if you'd rather rely on hooks alone for Phase 0 and
   defer loader enforcement.
7. **Persistence-of-findings mechanism is in scope only as far as the eval
   runner needs it.** A real "persist findings to `artifacts/**`" workflow is not
   built here. Flag if you want it fully specified now.
8. **Directory naming: `docs/intent/` and `docs/specs/`.** The repo uses
   `docs/intent/` (singular); the SDLC doc and skill text say `docs/intents/`.
   This spec is filed at `docs/specs/001-context-substrate-eval-harness.md` to
   match the existing `docs/specs/` directory. Flag if the intent dir should be
   renamed to `docs/intents/` for consistency instead.

## Open questions

Carried from `intent.md`:

1. **Corpus scope for this slice.** Full spec §10 corpus now, or only the subset
   needed to make `sow-review` and `find-evidence` provable, with opportunities /
   meeting notes / case studies following in Phase 1? No lean — the plan stage
   decides, and it directly drives whether the two-week timebox holds.
2. **Quarantine hook: full strength or stubbed?** Spec recommends full strength
   (Judgment call #1). Confirm or override.

New, surfaced by this spec:

3. **Does `find-evidence` get a corpus of historical `artifacts/**` to retrieve
   from at all in this slice?** If the corpus-scope decision defers opportunities
   and their artifacts to Phase 1, `find-evidence` can only retrieve from
   `context/org/evidence/**` and `context/demand-gen/**` — still a valid
   retrieval test, but narrower than the skill's eventual job. Decide whether
   that is acceptable for Phase 0 or whether a minimal set of historical
   artifacts must be in the slice.
4. **Where does the "separate step that persists findings" live** — a
   `packages/context-core` function, a dev skill, or a plain script in
   `evals/runner/`? Affects what the plan builds.
5. **Schema versioning mechanism.** `schema_version` is in `frontmatter-common`,
   but the process for evolving a schema (and migrating or re-validating the
   corpus) is undefined. Phase 0 can defer this, but the field's semantics
   should be nailed down so later phases aren't guessing.
