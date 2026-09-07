# ADR 0001 — Phase 0 skills are deterministic, not LLM-backed

**Status:** accepted · **Date:** 2026-09-07 · **Context:** plan `docs/plans/001-context-substrate-eval-harness.md`

## Decision

`find-evidence` and `sow-review` ship in Phase 0 as **deterministic, rule-based**
implementations. They do not call an LLM.

- `sow-review` scans the reviewed inbound document for the `unacceptable_patterns`
  regexes declared in each `context/legal/clause-library/*.md` entry, and emits
  one structured `Finding` per distinct clause hit.
- `find-evidence` ranks its resolved context scope with a BM25-lite lexical
  scorer (`context-core`'s `search`).

## Why

1. **The non-negotiable gate is `sow-review` blocker recall = 1.00.** A sampled
   LLM cannot *guarantee* 1.00 across runs. A regex over the clause library can,
   and its failures are debuggable as code, not as prompt-tuning.
2. **Phase 0's job is to prove the *substrate*** — that a context schema, a skill
   contract, and an eval gate are inseparable and enforced — not to demonstrate
   model quality. Model quality is the Phase 1 public spine
   (`call-prep → call-summary → proposal-draft`).
3. The eval harness, grant enforcement, quarantine/taint control, citation
   validity, and `writeFindings` are **identical either way**.
4. It keeps the two-week timebox: no API keys, rate limits, flake, or judge-model
   cost; CI is deterministic.

## Consequences

- The deliberate prompt-injection in the corpus **cannot steer `sow-review`** —
  there is no model in the loop to steer. The injection eval instead proves the
  *control*: `evals/runner/injection-harness.ts` ingests the redline (populating
  the taint ledger exactly as `readInbound` does) and routes the induced `Write`
  through the real `.claude/hooks/quarantine-inbound.ts`, asserting it is blocked.
- Retrieval quality is a lexical baseline. Honest as such.

## How Phase 1 swaps in an LLM

Add an Agent-SDK-backed file under `packages/skills/src/impl/` and select it from
the skill's YAML definition (a `strategy` field, or a per-id impl map in
`runner.ts`). **No change** to `skill-def.schema.json`, `context/schema/**`, the
scorers, or the eval cases. The output contract (`finding.json`,
`retrieval-result.json`) and the gates are unchanged; an LLM impl must clear the
same bar.

If an LLM `sow-review` cannot hit blocker recall 1.00 reliably, the deterministic
matcher stays as a backstop the model's output is unioned with — that is a Phase 1
decision, not this one.
