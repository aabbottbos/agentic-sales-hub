# 004 — call-prep + the write path

**Tier:** tier:2
**Status:** draft
**Issue:** (to be opened after this file is committed)

## Problem
Generated artifacts have nowhere durable to live and no outcome tracking. `call-summary`
(intent 002) returns a structured object but the persistence step was explicitly deferred
("a separate step (WI-2) persists it"). Without `writeArtifact()` and `appendOutcome()`,
every generation skill's output stays ephemeral — there is no on-disk artifact to cite
later, no outcome record to close the loop on what was sent, and no enforcement
preventing a skill (or a stray edit) from writing outside a validated path. This also
blocks `call-prep` itself, the next generation-tier skill in the deal spine and a
prerequisite for `proposal-draft` (WI-3), which needs the same write path.

## Proposed outcome
`call-prep` exists as a second LLM-backed generation skill (following the `call-summary`
pattern from intent 002) that produces a call-prep brief citing its sources. Its output —
and any future generation skill's output — is persisted through `writeArtifact()` to the
account/opportunity-scoped path spec v2 §4 already fixes:
`context/accounts/<account-slug>/opportunities/<crm-opportunity-id>/artifacts/<id>-<kind>.md`
— the same accumulating, append-only branch of the tree as `meetings/**` and
`outcomes.jsonl`, resolved through `resolveContextRoot()`/`resolveContextPath()` (WI-1)
like everything else. There is no separate top-level artifacts root; `**/artifacts/**` in
the protect-paths glob matches this nested per-opportunity path.

`writeArtifact()` validates against the artifact kind's output schema, enforces the
writing skill's declared grant, and opens an `unused` outcome record automatically.
`appendOutcome()` provides the only way to update that record's status, and it is
strictly append-only. Direct `Write`/`Edit` to `**/artifacts/**` is blocked by the
`protect-paths` hook — artifacts are written through `writeArtifact()` or not at all.

## Who it affects
- New: `packages/skills/src/impl/call-prep.ts` (LLM-backed, behind the existing
  `SkillImpl` interface).
- New: `packages/context-core/src/write-path.ts` — `writeArtifact()` and `appendOutcome()`.
- New schemas: `context/schema/brief-output.json`, `context/schema/outcome-record.json`.
- `.claude/hooks/protect-paths.ts` — extended to deny direct writes to `**/artifacts/**`
  (i.e. `context/accounts/**/opportunities/**/artifacts/**`, and the corresponding path
  under `examples/demo-corpus/` per WI-1's dual-root protection).
- `evals/` — new generation-class eval cases for `call-prep`.
- Does not touch `routeIntake()` (explicitly deferred to WI-5) or the template loader
  (WI-5) — `writeArtifact()`'s template check is a no-op until an org template exists.

## Constraints
- Must follow the `SkillImpl` / `runSkill` / `skill-def.schema.json` contract intent 002
  established without modification — no seam churn.
- Artifact path shape is fixed by spec v2 §4 (see Proposed outcome) — not a design
  decision for this intent or its spec.
- `writeArtifact()`'s output-template validation must be inert (never block) when no org
  template is present, since templates don't exist until WI-5.
- `appendOutcome()`'s `Outcome` enum ships exactly as specified in amendment §5.3
  (`sent | won | lost | redline_accepted | redline_rejected | superseded | unused`).
  Any reshaping for the North Star's not-yet-slotted compounding-loop / reuse-rate work
  is out of scope here and would be its own T2 change later.
- Must run on the tenancy seam from WI-1 (`resolveContextRoot()`) — no hardcoded
  context-root assumptions in the new write-path code.
- WI-1 → WI-2 dependency: WI-1 is shipped, so this is unblocked.

## Open questions
- Does `writeArtifact()` need a dry-run/preview mode for the eval harness, or does the
  eval suite call it for real against a scratch corpus copy? (Affects whether eval runs
  mutate `examples/demo-corpus/**/outcomes.jsonl`.)
- Exact `ArtifactKind` → schema mapping for `call-prep`'s `"brief"` kind — is
  `brief-output.json` structurally similar enough to `summary-output.json` (intent 002)
  to reuse patterns (citation shape, `[unsourced]` markers), or does a call-prep brief
  need a materially different structure (e.g. sectioned by talk track vs. commitments)?
- `<id>` minting in `<id>-<kind>.md` — what's the id scheme (timestamp, ULID, sequence
  per opportunity)? Needs to be collision-free across concurrent skill runs and stable
  enough to cite from later artifacts.

## How we'll know it worked
- `pnpm eval --suite call-prep`: rubric ≥ 4.0/5, citation validity = 1.00.
- `writeArtifact()` refuses a body missing a required section when an output template is
  present, and refuses a write outside the calling skill's declared grant — both covered
  by unit tests.
- Every artifact written opens an `unused` outcome record; `appendOutcome()` cannot
  rewrite or delete an existing line — unit test.
- The `protect-paths` hook blocks a direct write to the nested `artifacts/` path — test
  in the hook suite.
- No net regression on any existing eval suite (`sow-review`, `find-evidence`,
  `call-summary`) or the full unit test count vs. the last committed result.
