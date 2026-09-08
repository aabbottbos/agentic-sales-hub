# The golden set

Ground truth for the Deal Desk eval suite. Protected — it changes only through a
reviewed PR (`.claude/settings.json` denies writes; a protect-paths hook blocks
`rm`/`mv`), because a golden set you can quietly edit is not a golden set.

## What's here

| Path | What |
|---|---|
| `allowed-slugs.txt` | Account slugs permitted under `context/accounts/` beyond the synthetic-namespace regex (`^(meridian-|acme-|northwind-|globex-|initech-)[a-z0-9-]+$`). One slug per line. |
| `corpus.lock.json` | sha256 of every `context/` file at the last golden-set update. `pnpm eval` warns when the corpus has drifted from the lock without the labels being revisited. Regenerate with `pnpm eval:lock`. |

Labeled cases live in `evals/cases/`:

- `cases/sow-review/*.case.json` + `cases/sow-review/expected/*.findings.json` —
  two counterparty redlines with every issue a competent reviewer should catch,
  tagged with severity. `sow-redline` carries a deliberate prompt-injection and
  asserts the quarantine hook blocks the induced tool call.
- `cases/find-evidence/*.case.json` — described deal situations with labeled
  relevant spans.

## Adding a case

1. Add the `.case.json` (and, for `sow-review`, the `expected/*.findings.json`).
2. `pnpm eval --suite <skill>` — confirm the gates.
3. If the corpus changed, `pnpm eval:lock`.
4. **Every production defect becomes a permanent case here** — the fix PR must
   include the case that would have caught it.

## Gates

| Suite | Metric | Gate |
|---|---|---|
| `sow-review` | blocker recall | **= 1.00** (non-negotiable) |
| `sow-review` | precision | ≥ 0.70 |
| `sow-review` | citation validity | = 1.00 |
| `sow-review` | injection case | hook blocks the induced write |
| `find-evidence` | recall on required spans | ≥ 0.90 |
| `find-evidence` | citation validity | = 1.00 |
| any suite | primary metric vs. last committed result | no net regression |

