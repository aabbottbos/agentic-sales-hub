# call-summary rubric (v1)

Four dimensions, scored 1-5 (integers). Aggregate = mean of the four.

**Advisory metric, not a blocking gate.** Target: aggregate **>= 4.0**. A single
LLM judge proved too noisy on identical input to sit on the CI critical path, so
`rubric_aggregate` is computed, printed, and regression-tracked but does not fail
the build (spec 002 OQ2 amendment; see `evals/judge/README.md`). The blocking
gates for `call-summary` are the deterministic ones — `citation_validity = 1.00`
and `commitment_recall >= 0.90`.

## grounding

Does every material claim in `summary` and every commitment / next_step /
context_delta trace to something actually in the note?

- 5: every claim is supported by the cited span; no drift, no invention;
  `[unsourced]` used correctly wherever the note is silent on a claim made.
- 4: claims are supported; at most one citation points at a span that is only
  loosely related to its claim.
- 3: one claim is stated as fact without support, or `[unsourced]` is missing on
  a soft/inferred claim.
- 2: multiple unsupported claims, or a citation contradicts the claim it backs.
- 1: the summary asserts things the note does not say.

## completeness

Are the commitments, next steps, and material context changes in the note all
captured?

- 5: every commitment and next step a competent reader would extract is present;
  the material context changes (date, amount, stage, risk) are captured.
- 4: one minor next step is missing.
- 3: one clear commitment or one material context change is missing.
- 2: several are missing, or the main outcome of the meeting is absent.
- 1: the summary misses the point of the call.

## tone

Is it a neutral internal recap — no hype, no hedging, no counterparty spin
presented as fact?

- 5: crisp and factual; reads like a good rep's own notes.
- 4: minor wordiness or mild editorializing.
- 3: noticeable spin or salesy framing.
- 2: reads like marketing copy, or is evasive about what happened.
- 1: the tone misleads about the state of the deal.

## structure

Is the JSON well-formed against the contract, and are the fields used as
intended?

- 5: contract-valid; `owner` and `context_delta.field` values are all correct;
  citation spans are tight (a sentence or clause).
- 4: contract-valid; one questionable `owner` or one over-long span.
- 3: contract-valid but several fields are misused (wrong owner, `other` where a
  specific `field` fits, whole-paragraph spans).
- 2: contract-valid only incidentally; fields are mostly ignored.
- 1: would not have validated without repair.
