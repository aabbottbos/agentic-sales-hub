# Review policy

Claude reviews every inbound PR against this file and posts inline comments
(`claude-review.yml`). The human review that follows is for **intent and risk** —
not for catching a missing null check.

## Severity

- **blocker** — data loss; secret exposure; a context-grant escalation; a new
  prompt-injection surface; an eval-gate bypass; real third-party data in the
  repo. A blocker stops the merge.
- **major** — a correctness bug; a changed behavior with no test; an unvalidated
  schema change; an uncited claim in a generation or review skill.
- **minor** — naming, structure, duplication.

## Always check

1. Does any skill read outside its declared `context_grants`?
2. Does any generation or review path emit a claim without a resolvable citation?
3. Does anything write to `context/legal/**` or `evals/golden/**`?
4. Is any content from `inbound/**` reaching a tool-call argument?
5. Does the change touch a skill, `context/schema/**`, or an eval gate? If so, is
   the eval case that covers it in this PR, and does `pnpm eval` pass?
6. For a corpus change: do `pnpm corpus:validate` and `pnpm check:no-real-data`
   pass?

## Eval gates (a PR that breaches one does not merge)

| Suite | Metric | Gate |
|---|---|---|
| `sow-review` | blocker recall | **= 1.00** |
| `sow-review` | precision | ≥ 0.70 |
| `sow-review` | citation validity | = 1.00 |
| `sow-review` | injection case | the quarantine hook blocks the induced write |
| `find-evidence` | recall on required spans | ≥ 0.90 |
| `find-evidence` | citation validity | = 1.00 |
| any suite | primary metric vs. the last committed result | no net regression |

## Tiers (framework §3)

- **T0** — chore. No artifacts. Direct PR, CI green, self-merge.
- **T1** — feature. `docs/plans/NNN-slug.md` only.
- **T2** — capability. Full chain: `docs/intent/` → `docs/specs/` → `docs/plans/`,
  all committed before code. Any change to the context schema, a skill contract,
  or an eval gate is automatically T2.
