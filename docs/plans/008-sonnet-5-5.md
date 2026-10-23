# Plan 008: Move the generation skills to Claude Sonnet 5.5 (T1)

## Context

This is item 3 in HANDOFF's build order (agreed 2026-10-23). `call-summary` and `call-prep` pin `claude-sonnet-5`. Claude Sonnet 5.5 (`claude-sonnet-5-5`) is its successor at the same price ($2 / $10 per MTok) and uses the same tokenizer. This is a model swap behind the existing `impl/llm.ts` seam. No skill contract, schema, or gate changes, so it's T1.

**Breaking change found (Claude API migration guide, confirmed by a live probe on 2026-10-23):** `llm.ts` sends `thinking: {type: "disabled"}`, which Sonnet 5.5 rejects with a 400 ("To turn thinking off on this model, send `between_tools`"). We disable thinking deliberately. On Sonnet 5, extraction and judging prompts otherwise spent all of `max_tokens` thinking and returned no text. The Sonnet 5.5 equivalent is `thinking: {type: "between_tools"}`:
- No extended thinking.
- Only valid at effort `high` or below.
- No other field allowed in `thinking`.
- Sonnet 5.5 only; any other model rejects it.

The live probe with `between_tools` + effort `high` + server-side fallback returned clean JSON text and no thinking blocks.

**Other Sonnet 5.5 changes that matter here:**
- Effort levels are recalibrated, so we set effort explicitly instead of relying on the default.
- There are new refusal categories (`stop_reason: "refusal"`, HTTP 200). Today `once()` would join zero text blocks, and that would surface as a confusing JSON-parse failure in the skill.

**The judge stays on `claude-sonnet-5` in this PR** (`evals/judge/judge-model.json`). Changing the skill and the instrument that scores it at the same time would make the rubric delta uninterpretable. Moving the judge is a separate follow-up.

## Changes

1. **`packages/skills/src/impl/llm.ts`, inside `once()`:** pick the request shape by model:
   - **`claude-sonnet-5-5`:** call `client.beta.messages.create` with:
     - `thinking: {type: "between_tools"}`, cast because SDK 0.124's `ThinkingConfigParam` doesn't type it yet;
     - `output_config: {effort: "high"}`, explicit; the levels are recalibrated and `between_tools` caps at `high`;
     - `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`, the skill-recommended default for Sonnet 5.5 on the Claude API. It retries `cyber` and `frontier_llm` declines on Sonnet 5 server-side, and the server converts `between_tools` to `disabled` there.
   - **Any other model (the judge on `claude-sonnet-5`):** unchanged, i.e. `messages.create` with `thinking: {type: "disabled"}`.
   - **Both paths, before reading content:** if `stop_reason === "refusal"`, throw an `Error` naming `stop_details.category`. It isn't transient, so `complete()` won't retry it. If `res.model !== args.model` (a fallback served the request), `console.warn` once, so eval logs show which model produced the output.
   - Update the doc comments: the `maxTokens` note and the "Thinking is explicitly disabled" rationale now cover both models.
2. **`packages/skills/src/impl/call-summary.ts:13` and `call-prep.ts:15`:** set `MODEL = "claude-sonnet-5-5"`.
3. **`packages/skills/src/impl/call-summary.test.ts`:** move the seam shape test's model literal to `claude-sonnet-5-5`. Add unit tests for `once()`'s request shape through `_setClientForTest`, with a stub capturing the params:
   - `claude-sonnet-5-5` → beta path, `between_tools`, effort `high`, fallback beta and `fallbacks: "default"`;
   - `claude-sonnet-5` → standard path, `disabled`;
   - a refusal response → throws with the category;
   - a fallback-served response → returns the text and warns.
4. **`evals/runner/run-suite.ts` (~564, ~794):** the two `_setClientForTest` stubs fake only `messages.create`. Give them the same handler under `beta.messages.create` too, because the skills now go through the beta path.
5. **Docs:** in `evals/judge/README.md`, add one line stating that the skills are on `claude-sonnet-5-5` and the judge stays on `claude-sonnet-5`, and why. In HANDOFF, mark item 3 done, add a follow-up to move the judge to Sonnet 5.5 as its own calibrated change, and record the calibration numbers.

## Calibration (the "3 calibration runs")

- **3× `pnpm eval --suite call-summary` and 3× `--suite call-prep`, with the real key.** Hard gate: citation validity = **1.00 on every run**. A single miss means investigate before shipping. Never weaken the gate.
- **Record per run:** rubric aggregate (advisory), commitment recall (advisory), and any refusal or fallback warnings. Compare against the Sonnet 5 history in `evals/results/` (call-summary rubric 3.25–3.75; call-prep 4.25–5.0).
- **Then one `pnpm eval --suite all --write-results`.** All gates must pass with `regression_verdict: PASS`, including `watcher-trigger` and the MCP cases. Commit the results file.
- **If citation validity slips** on Sonnet 5.5, the first lever is effort `medium` vs `high` with `between_tools`. Report back before going further.

## Files

- `packages/skills/src/impl/llm.ts`, `call-summary.ts`, `call-prep.ts`, `call-summary.test.ts`
- `evals/runner/run-suite.ts` (stubs)
- `evals/judge/README.md`, `HANDOFF.md`, `docs/plans/008-sonnet-5-5.md`
- `evals/results/<date>-<sha>.json`

## Verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`: green.
- 3+3 calibration runs at citation validity 1.00 on all of them, numbers recorded in the plan doc and PR.
- The full suite with `--write-results` passes. CI `evals.yml` reruns it on the PR with the repo secret.
