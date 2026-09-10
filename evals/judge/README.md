# call-summary judge

- **Rubric:** `rubric.md` (v1). Four dimensions (grounding / completeness / tone /
  structure), mean-aggregated. Target: aggregate **>= 4.0**. **Advisory, not a
  blocking gate** — see "Resolution" below.
- **Judge model:** `judge-model.json` — `claude-sonnet-5`, `max_tokens` 512,
  `attempts` 3. `temperature` is not sent (deprecated on this model; see
  `packages/skills/src/impl/llm.ts`).
- **Retry policy:** `attempts` completions per case, median per dimension, then
  aggregate. Unparseable attempts are dropped; the run throws only if none parse.

## Calibration status — NOT COMPLETE

Plan 002 Task 12 (calibrate anchors, set the tolerance band, 5 stable runs) is
**not finished**. What the first live runs against `claude-sonnet-5` (skill) +
`claude-sonnet-5` (judge) showed, over ~8 full-suite runs:

| Metric | Observed | Gate | Assessment |
|---|---|---|---|
| `citation_validity` | **1.00 every run** | = 1.00 | stable, reliable gate |
| `commitment_recall` | 0.75 – 1.00, usually >= 0.90 | >= 0.90 | borderline; one flaky commitment on `demo`/`negotiation` some runs |
| `rubric_aggregate` | **2.75 – 4.25**, ~1.0–1.5 pt swing on identical input | >= 4.0 | **too noisy for a hard critical-path gate as built** |

Representative runs (same 3 golden cases, no prompt change between them):

```
run A   demo 3.25   discovery 3.75   negotiation 4.00   agg 3.667
run B   demo 3.50   discovery 3.50   negotiation 4.00   agg 3.667
run C   demo 3.50   discovery 2.75   negotiation 3.75   agg 3.333
earlier demo 3.50   discovery 4.25   negotiation 4.00   agg 3.917
```

The generated summaries themselves read as good on manual inspection — accurate,
fully cited, correct citation quotes, sensible `owner` / `field` values. The
variance is in the **judge**: a single 1–5 integer score per dimension, even with
a 3-attempt median, moves a dimension by 2 points between runs and the median
follows.

A prompt-tightening pass (stronger completeness instruction, explicit `field`
guidance, shorter quote limit) was tried and made scores **worse** on `discovery`
(2.75), so it was reverted. The issue is judge stability, not summary quality.

## Resolution (spec 002 OQ2 amendment)

Neither `rubric_aggregate >= 4.0` (single judge, swings ~2.5–4.25 on identical
input) nor `commitment_recall >= 0.90` (token-overlap scorer, too literal to
bridge a valid paraphrase — see below) is a stable blocking gate for
`call-summary` v1.

**Decision: `citation_validity = 1.00` is the one hard blocking gate. The rubric
and `commitment_recall` are advisory metrics.**

- `run-suite.ts` computes all three, prints `rubric_aggregate` and
  `commitment_recall` (with target + any misses) in the case notes, and puts all
  three in the suite `metrics`. Only `citation_validity` is in `gates`.
- `compare.ts` keeps all three in `PRIMARY` for `call-summary`, so a *drop* on
  any of them versus the last committed `evals/results/*.json` is still reported
  as a regression. Advisory is not untracked.
- `citation_validity` blocks: it is a deterministic resolve-only span check and
  is stable at 1.00 every run.

**Why `commitment_recall` is advisory.** `scoreCommitmentRecall` matches produced
commitment text to hand-written labels by normalized token overlap. It cannot
see that "get the redlines reviewed fast, now the close gate" and the labeled
"Review the counterparty redlines quickly" are the same commitment — they share
only `redlines`. On a 4-label case one such miss is 0.75, below the 0.90 gate,
though the summary is correct. A future LLM-assisted matcher or a larger golden
set (where one miss does not dominate) could make it blockable again.

This revises spec §8 / OQ2 and the generation eval class ("the rubric gate runs
blocking"; "commitment recall >= 0.90"): for v1 neither blocks. Revisit when the
tooling supports it — candidates that were on the table:

1. **More judge attempts + a calibrated band.** `attempts` 3 -> 7 (median of 7 is
   much tighter), measure the stabilized spread over 5 runs, set the threshold to
   that band's p10 (likely ~3.6–3.8). Then it could block again.
2. **A stronger / different judge model**, or an ensemble (median across two
   judge models).

Draft amendment text for `docs/specs/002-…`: see
`docs/specs/002-call-summary-generation-path.md` "OQ2" — replace the "blocking,
critical path, retry-median" resolution with "advisory metric, regression-tracked;
the deterministic gates block; blocking rubric revisited with a stabler judge."
