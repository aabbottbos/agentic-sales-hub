# call-summary judge

- **Rubric:** `rubric.md` (v1). Four dimensions (grounding / completeness / tone /
  structure), mean-aggregated. Intended gate: aggregate **>= 4.0** (from spec 002
  OQ2, cold-reviewed).
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

## The open decision (for a human)

`rubric_aggregate >= 4.0` on the `evals.yml` critical path, with this
skill-model + judge-model pairing and a single judge, is not a stable gate. Spec
OQ2 says "skip-with-warning is not a gate", so any of the following needs a spec
amendment, not just a plan change:

1. **More judge attempts + a calibrated band.** `attempts` 3 -> 7 (median of 7 is
   much tighter), measure the stabilized spread over 5 runs, lower the threshold
   to whatever the p10 of that band is (likely ~3.6–3.8).
2. **Split the gate.** Keep `citation_validity = 1.00` and
   `commitment_recall >= 0.90` as hard blocking gates (both stable enough).
   Make `rubric_aggregate` advisory — computed, reported, tracked for regression
   in `evals/results/`, but not a build-blocker.
3. **A stronger / different judge model**, or an ensemble (e.g. median across two
   judge models).

Until this is decided, `pnpm eval --suite call-summary` FAILS on the rubric gate.
The deterministic gates pass.
