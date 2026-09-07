---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-09-01T00:00:00Z"
title: Indemnity (fixture)
clause_id: indemnity
topic: Indemnification
position: unacceptable
rationale: Indemnity must be capped at trailing twelve months fees. Uncapped indemnity is a blocker.
standard_language: Each party's indemnification obligations are capped at fees paid in the trailing twelve months.
unacceptable_patterns:
  - "uncapped"
  - "without limitation"
pattern_severity:
  "uncapped": blocker
  "without limitation": blocker
---

The cap rationale block lives here in the body for citation resolution tests.
