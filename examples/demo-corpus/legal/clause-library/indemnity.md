---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Clause — Indemnification
clause_id: indemnity
topic: Indemnification
position: unacceptable
rationale: >-
  Meridian's standing position is that ALL indemnification obligations are capped
  at fees paid in the trailing twelve months, including indemnification for
  third-party intellectual-property infringement claims. An uncapped indemnity —
  or an IP indemnity carved out of the liability cap — exposes Meridian to
  unbounded loss on a fixed-fee contract and is a blocker. A counterparty redline
  that strikes the indemnity cap, or inserts language obligating Meridian to
  indemnify "for all losses" or "without limitation," must be flagged as a
  blocker and cannot be accepted without VP Legal approval per
  legal/guidance.md.
standard_language: >-
  Each party shall indemnify, defend, and hold harmless the other from third-party
  claims to the extent arising from the indemnifying party's breach of this
  Agreement or infringement of a third party's intellectual property rights,
  provided that each party's total indemnification liability under this Section is
  capped at the fees paid or payable by Customer in the twelve (12) months
  preceding the claim, and excludes claims arising from Customer Data, Customer
  modifications, or combination of the Platform with non-Meridian products.
unacceptable_patterns:
  - "uncapped"
  - "unlimited indemnification"
  - "without limitation"
  - "indemnify .{0,40}for all"
pattern_severity:
  "uncapped": blocker
  "unlimited indemnification": blocker
  "without limitation": blocker
  "indemnify .{0,40}for all": blocker
---

# Indemnification

## Position: unacceptable (as counterparties typically redline it)

Meridian caps **every** indemnification obligation — IP included — at
trailing-twelve-months fees. This is non-negotiable below the VP Legal approval
bar.

## What a bad redline looks like

- Striking the "capped at the fees paid... in the twelve (12) months" clause.
- Inserting "Supplier shall indemnify Customer for all losses **without
  limitation**."
- "Supplier's indemnification obligations are **uncapped**."
- "**unlimited indemnification** for claims of intellectual property
  infringement."

Any of these → **blocker**, cite this file.

## Fallback ladder

See `../guidance.md` § Indemnification. Mutual cap → platform-IP indemnity with
exclusions → 2x super-cap for IP only, above $500k ACV, VP Legal sign-off.
