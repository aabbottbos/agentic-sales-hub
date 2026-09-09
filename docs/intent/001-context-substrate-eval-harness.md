# 001 — Phase 0: Context Substrate + Eval Harness

**Tier:** tier:2
**Status:** draft
**Issue:** #1

## Problem

There is no context substrate for Agentic Sales Hub to build on, and no way to verify
that a skill's output is trustworthy once one exists. Every downstream capability
— `call-prep`, `call-summary`, `proposal-draft` in Phase 1, and the web surface
in Phase 2 — depends on a schema-defined, git-native context model being settled
first. Building any of those before the schema is fixed means rework the moment
the schema changes underneath them.

Separately, contract/SOW review is the highest-liability workflow in the system
and also the one with the crispest ground truth: a clause either violates a
labeled position or it doesn't. That combination is why the spec calls for
proving it privately, against evals, before anything public-facing is built on
top of it. There is no eval harness to prove it against, so `sow-review` can't be
trusted even in a private test.

Until the substrate and the harness both exist, nothing in the project can be
verified rather than asserted — which is the whole premise of building this under
an AI-native SDLC.

## Proposed outcome

The context substrate stands up — JSON Schema, the `context-core` loader, and a
synthetic corpus slice sufficient to exercise it — alongside the eval harness
(golden set, runner, scorers). The first two skill contracts are implemented
end-to-end: `find-evidence` (retrieval tier) and `sow-review` (review tier).

`sow-review` achieves blocker recall of 1.00 on both labeled counterparty
redlines in the golden set, every finding carries a valid citation back into
`context/legal/**`, and the eval suite runs automatically in CI on every PR that
touches `.claude/skills/**`, `packages/skills/**`, `context/schema/**`, or
`CLAUDE.md`.

This is deliberately the smallest slice where schema, skill contract, and eval
gate are inseparable — not the full Phase 0 corpus described in spec §10, and not
`call-prep` / `call-summary` / `proposal-draft`, which are Phase 1 and get their
own intent.

## Who it affects

Andrew, as sole builder, reviewer, and user. There is no team to hand this off
to, but everything built after this point — every later skill, the MCP server,
the trace viewer, the public repo — inherits whatever's decided here about the
shape of context and the shape of "verified." A mistake in the schema or the
grant model doesn't cost a bad PR later; it costs a rebuild of everything
downstream. This is also the piece most likely to be scrutinized by an outside
reader once the repo is public — the spec calls out the eval harness and the
context spec as the most differentiating artifacts in the project.

## Constraints

- **Opportunity ID is the primary key, CRM-shaped from day one.** Even in
  synthetic data, mint IDs that look like Salesforce/HubSpot object IDs and
  record `crm_system` + `crm_id` in frontmatter. No migration path is planned.
- **Git is the store.** No database. Every context object is a file with typed
  frontmatter validated against a published JSON Schema.
- **Two mutability classes.** Canonical context (`org/`, `legal/`, `demand-gen/`)
  is versioned and reviewed on change. Accumulating context (`accounts/`) is
  append-only — a meeting note is never rewritten, a superseded artifact is
  marked superseded, never deleted.
- **Provenance is mandatory.** No claim without a citation. Anything a generation
  or review skill can't source is marked `[unsourced]` rather than asserted.
- **Context grants are declared and enforced at the loader, not by prompt.**
  `sow-review` gets a read grant and no write grant at all — it returns
  structured findings only, per the JSON contract in spec §5.1; persisting them
  is a separate step.
- **`inbound/**` is untrusted.** Counterparty-supplied documents (e.g. the
  redlines `sow-review` evaluates) are read-only, quarantined, and wrapped in
  explicit untrusted-content delimiters. A hook blocks any tool call whose
  arguments originate from `inbound/**` content, and every ingestion is logged in
  the trace with a hash of the source.
- **No real third-party data, anywhere, ever.** Synthetic corpus only, inside the
  fictional namespace, with a `FICTIONAL` banner in every file's frontmatter and
  `CORPUS.md` at the repo root. A CI check fails on anything outside that
  namespace in `context/accounts/`.
- **Blocker recall = 1.00 is non-negotiable;** precision ≥ 0.70 on `sow-review`
  findings. A reviewer that misses an uncapped indemnity is worse than none.
- **Non-goals stay non-goals for this slice:** no multi-tenant auth, no CRM sync,
  no dashboards, no MSA/SOW generation, no e-signature, no claim that any output
  is legal advice.
- **Timebox: two weeks (Sep 8 – Sep 19, 2026).** If Phase 0 isn't producing a
  green, CI-verified `sow-review` by Sep 19, the scope came in too big — cut the
  corpus before extending the deadline.
- **Assumed decided, not open for the spec to relitigate:** public repo from day
  one (commit history is part of the AI-SDLC demonstration); MIT `LICENSE` file
  is a Phase 3 concern since no surface package exists yet; Phase 0 leans
  entirely on the synthetic golden set with no private pass against real deal
  material (spec §12.3 fallback).

## Open questions

- **Corpus scope for this slice.** Spec §10 describes a full first-class corpus —
  four opportunities, ~12 meeting notes, three case studies, two labeled
  redlines. Does Phase 0 build all of it now, or only the subset needed to make
  `sow-review` and `find-evidence` provable, with the rest following in Phase 1?
  No lean — the spec stage decides.
- **Quarantine hook: full strength or stubbed in Phase 0?** The golden set's
  injection case needs the `inbound/**` quarantine hook to be real to mean
  anything, and the hook is listed under Phase 0 deliverables in the repo layout
  (`.claude/hooks/quarantine-inbound.sh`). Confirm it ships at full strength in
  this slice rather than being discovered as a gap when the eval runs.

## How we'll know it worked

- `sow-review` scores blocker recall = 1.00 on both labeled redlines in the
  golden set, every finding includes a citation that resolves into
  `context/legal/**`, and precision is ≥ 0.70.
- `find-evidence` returns ranked, cited results against the corpus with recall
  ≥ 0.90 on the golden set's labeled relevant spans.
- `context/schema/` exists, is published, and the synthetic corpus validates
  against it with zero schema errors.
- `evals.yml` runs on every PR touching skills, schema, or `CLAUDE.md`, posts a
  pass-rate comparison against `main`, and fails the build on any gate breach or
  net regression.
- The deliberate prompt-injection case in the golden set is caught by the
  quarantine hook, not by the model declining on its own.
- CI's no-real-data check and `gitleaks` both pass with zero findings against the
  corpus.
