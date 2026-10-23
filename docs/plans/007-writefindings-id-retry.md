# Plan 007: `writeFindings` id minting with collision retry (T1)

## Context

HANDOFF follow-up 13, found while writing `42e3aef`'s queue-interleaving test. `writeFindings()` (`packages/context-core/src/findings/write-findings.ts`) builds its default artifact id from the clock alone: `f-<date>-<shortId(now)>`, where `shortId` = `now.getTime().toString(36).slice(-6)`. Two default-id calls in the same clock tick get the same id. The second one then fails with `AppendOnlyViolationError`; there is no retry.

`writeArtifact()` (`packages/context-core/src/write-path.ts`) already solves this. `mintNextId` lists `artifacts/`, mints the next free id, writes with `flag: "wx"`, and retries on `EEXIST` up to `MAX_MINT_ATTEMPTS` (8). The per-opportunity queue serializes calls within one process but doesn't change ids. The workaround is visible in `opportunity-queue.integration.test.ts:239-249`, which has to pass explicit `f-concurrent-${i}` ids because of this.

There is no production caller yet; `sow-review` findings are persisted only by the eval runner. This fixes it before one exists.

## Change: `write-findings.ts` only

1. **Keep the existing id format** as the first choice (`f-<date>-<shortId>`), so ids minted today are unchanged.
2. **Add a `mintFindingsId(root, artifactsDir, base)` helper**, modeled on `mintNextId`:
   - List `artifacts/`.
   - Collect files matching `^<base>(?:-(\d+))?-findings\.md$`.
   - If none, return `base`. Otherwise return `<base>-<max+1>`, where a bare `base` counts as 1. The result: `f-2026-09-18-abc123`, then `f-2026-09-18-abc123-2`, `-3`, and so on.
3. **Wrap the write in the same bounded loop** as `writeArtifact`:
   - `for (attempt < MAX_MINT_ATTEMPTS)`: mint, then `writeFile(..., { flag: "wx" })`.
   - On `EEXIST` with an explicit `args.artifactId`, throw `AppendOnlyViolationError`, as today.
   - On `EEXIST` with a default id, re-list and retry (another process got there first).
   - After all attempts fail, throw `AppendOnlyViolationError` naming the attempt count.
   - Re-listing on each attempt means N calls serialized by the queue all succeed, for any N. A fixed `-attempt` suffix would cap out at 8.
4. **Drop `assertDoesNotExist`** (its `readFile` pre-check is a TOCTOU race). `flag: "wx"` is the real guard, and the explicit-id `EEXIST` branch keeps the same error type.
5. **Validate first, then read the source.** Finding validation and `hashSourceDocument` stay ahead of the loop; only the mint, render and write repeat.

`MAX_MINT_ATTEMPTS` stays local to `write-findings.ts`, matching `write-path.ts`. Sharing it isn't worth a new module for two constants.

## Tests

- `write-findings.test.ts`:
  - **new:** N=5 sequential default-id writes under a frozen clock produce 5 distinct paths (`base`, then `base-2` through `base-5`), and each one validates.
  - **new:** an explicit `artifactId` that already exists still throws `AppendOnlyViolationError`. The existing "never overwrites" test already covers this; confirm it still passes.
  - The existing "two default-id writes produce two distinct files" test, which uses distinct clocks, still passes.
- `opportunity-queue.integration.test.ts:217`: **remove the explicit `f-concurrent-${i}` ids and their workaround comment.** That turns the test into the regression proof: 8 concurrent default-id `writeFindings` calls under a frozen clock all succeed with distinct ids. Confirm it fails on `main` first.

## Files

- `packages/context-core/src/findings/write-findings.ts`
- `packages/context-core/src/findings/write-findings.test.ts`
- `packages/context-core/src/concurrency/opportunity-queue.integration.test.ts`
- `docs/plans/007-writefindings-id-retry.md` (this plan)
- `HANDOFF.md`: mark follow-up 13 done. Stop pre-assigning intent numbers in "Next action" (this T1 plan takes 007, which already shifts them). Say "next free number at filing time" instead.

## Verification

- The modified queue test fails on `main` and passes on the branch.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`: green.
- `pnpm eval --suite sow-review` (deterministic, no API key): unchanged, injection PASS on both cases. The runner calls `writeFindings` separately, so this checks the persist path.
- `context-core` is under the eval-gated paths, so `evals.yml` runs a full suite in CI anyway. No local full LLM run is needed, because the skills and prompts are untouched.
- PR → CI green → user merges.
