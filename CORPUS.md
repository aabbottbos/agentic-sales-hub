# CORPUS.md

**Everything under `context/` (outside `context/schema/`) is fictional.**

Nothing in this repository describes, quotes, or is derived from a real company,
person, deal, contract, or set of terms. "Meridian Grid," "Acme Logistics,"
every person named, every meeting, every redline, every price, and every clause
position is invented for the purpose of exercising and demonstrating Agentic Sales Hub.

- Company and person names are obviously invented and share no branding with any
  real entity.
- No real logos, trademarks, or wordmarks appear anywhere.
- No real company's contract language has been copied. The clause library and
  templates are written from scratch to be *opinionated* and *checkable*, not to
  reproduce anyone's paper.
- Every corpus file's frontmatter carries `fictional: true`. CI
  (`pnpm check:no-real-data`) fails on any file under `context/` that does not.
- Account slugs must match the synthetic namespace
  (`meridian-`, `acme-`, `northwind-`, `globex-`, `initech-`) or be listed in
  `evals/golden/allowed-slugs.txt`.

The corpus is engineered to be *hard* — messy meeting notes, contradictions
between calls, redlines with genuinely dangerous clauses and one deliberate
prompt-injection attempt — because a demonstration that is easy to pass proves
nothing.
