<!-- Tier: T0 chore / T1 feature / T2 capability. T1+ links its plan; T2 links intent + spec + plan. -->

## What and why

<!-- One paragraph. Link the intent/spec/plan for T1+. -->

## Review checklist (mirrors REVIEW.md "always check")

- [ ] No skill reads outside its declared context grants.
- [ ] No generation/review path emits a claim without a resolvable citation.
- [ ] Nothing writes to `context/legal/**` or `evals/golden/**`.
- [ ] No content from `inbound/**` reaches a tool-call argument.
- [ ] If a skill / `context/schema/**` / an eval gate changed: an eval case is included, and `pnpm eval` passes.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.
- [ ] Corpus changes: `pnpm corpus:validate` and `pnpm check:no-real-data` pass.

## Verification

<!-- The exact commands run and their result. -->
