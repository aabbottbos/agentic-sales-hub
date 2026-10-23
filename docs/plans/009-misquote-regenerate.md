# Plan 009: Regenerate once on a misquoted citation (T1)

## Context

This is HANDOFF follow-up 15, and the user picked option 1 on 2026-10-23: fix it before plan 008, the move to Sonnet 5.5, ships. Both generation skills sometimes cite a "quote" that isn't verbatim in its file. On 10-23, for example, `call-prep` stitched two lines of `org/evidence/cs-midwest-freight.md` into `"6 weeks to 3.5 (down ~40%)"`.

`resolveCitationSpan` (`packages/skills/src/impl/citation-span.ts`) can't locate a quote like that, so the impl gives it an out-of-range span and the citation-validity gate (1.00) correctly fails the run. It has happened on Sonnet 5 (1 crashing run) and on Sonnet 5.5 (1 of 3 calibration runs). The effect is a flaky `evals` CI check, plus a refused `call-prep` persist in real use.

Today both impls (`call-prep.ts`, `call-summary.ts`) already loop up to `MAX_GEN_ATTEMPTS = 3`, but only on unparseable or schema-invalid output. A schema-valid output with unlocatable quotes is accepted on the first attempt. The model is never told what went wrong, and it never gets a second chance.

**Change:** treat "one or more quotes not found verbatim" as one extra retryable failure, and tell the model which quotes failed.
- The gate is unchanged.
- The skill contract, schemas, and system prompts are unchanged.
- It's an internal impl retry, so it's T1.
- If the retry still misquotes, return the best output honestly, and the gate fails as it does today.

## Design

1. **`citation-span.ts`, shared helpers:**
   - `interface UnlocatedQuote { path: string; quote: string }`.
   - `misquoteFeedback(failed: UnlocatedQuote[]): string` returns a short, deterministic note to append to the user prompt:
     > "Your previous answer cited these quotes, which do not appear verbatim in the file named: … Re-answer in full. Every `quote` must be copied exactly, as one contiguous passage from that one file. Never join text from two places. If no exact passage supports a claim, move it to `unsourced_claims`."

     It lists up to 10 quotes as `path: "quote"`, each truncated to 200 chars.
2. **Both impls:**
   - `fixCitations` returns the **list** of unlocated `{path, quote}` instead of a count. The trace and the existing callers use `.length`.
   - In the attempt loop, when output parses and validates:
     - If there are **no** unlocated quotes, accept it, as today.
     - If there **are** unlocated quotes, attempts remain, and **no misquote retry has been used yet**, keep this output as `fallback`, set `feedback = misquoteFeedback(list)`, push a trace step (`attempt N: K quote(s) not found verbatim; regenerating once with feedback`), and `continue`. The next attempt's user prompt is `buildUserPrompt(...) + "\n\n" + feedback`.
     - Otherwise, accept it with its unlocated quotes. The gate then fails honestly, as today.
   - At loop end with no accepted output: if `fallback` exists, return it (honest gate failure); otherwise throw, as today.
   - **The misquote retry is bounded to 1 regeneration**, so each run makes at most one extra LLM call. It shares `MAX_GEN_ATTEMPTS` with the parse/schema retries.
   - Inbound note on `call-summary`: the feedback quotes come from the model's own previous output, which was already checked against the wrapped note. Appending them adds no new untrusted channel.

## Tests

In `packages/skills/src/impl/call-prep.test.ts` and `call-summary.test.ts`, with `vi.spyOn(llm, "complete")` and `mockResolvedValueOnce` sequences:
- First output misquotes, second is clean: the result uses the second output, all citation spans resolve, `complete` is called **2** times, and the second call's `user` contains the feedback and the failed quote.
- Both outputs misquote: exactly **2** calls (not 3; the retry is bounded), and the result is the second output with the out-of-range span. No throw.
- A clean first output: **1** call. There's no regression on the happy path.
- The existing "out-of-range span" tests stay valid unchanged. They use `mockResolvedValue`, so the persistent misquote now costs 2 calls and still ends out-of-range.
- `misquoteFeedback` unit test: it lists path and quote, truncates, and caps at 10.

## Files

- `packages/skills/src/impl/citation-span.ts`
- `packages/skills/src/impl/call-prep.ts`, `call-summary.ts`
- `packages/skills/src/impl/call-prep.test.ts`, `call-summary.test.ts`
- `docs/plans/009-misquote-regenerate.md`

HANDOFF isn't touched here: plan 008's branch already carries the HANDOFF edits. It gets updated when 008 is rebased onto this.

## Sequencing

Branch `fix/009-misquote-regenerate` from `main`, then PR and merge. After that, rebase `feat/008-sonnet-5-5` onto it and re-run 008's calibration: 3x `call-prep` and 3x `call-summary` on Sonnet 5.5. Finally, run the full suite with `--write-results` and open the 008 PR.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`: green.
- `pnpm eval --suite call-prep` and `--suite call-summary` on `main`'s model (Sonnet 5): citation validity 1.00, and any regeneration shows in the trace notes.
- `pnpm eval --suite all --write-results`: all gates pass with `regression_verdict: PASS`. Commit the results file. CI `evals.yml` reruns it.
