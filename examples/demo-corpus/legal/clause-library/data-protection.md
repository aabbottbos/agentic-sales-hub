---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Clause — Data Protection and Audit
clause_id: data-protection
topic: Data Protection and Audit
position: preferred
rationale: >-
  The Meridian DPA governs, with Standard Contractual Clauses where a cross-border
  transfer applies. A Customer DPA is acceptable only if it does not expand
  Meridian's obligations beyond two limits: deletion SLA no shorter than 30 days,
  and audit rights no more than once per twelve months on at least 30 days'
  written notice. Two counterparty moves are MAJOR issues (not blockers, but
  cannot be accepted as-is): (1) audit "at any time" or "upon request" with no
  notice or frequency limit, and (2) a data-deletion SLA of 7 days or shorter.
  "Unlimited audit" rights are also a major. These are negotiated down using the
  fallback ladder in legal/guidance.md.
standard_language: >-
  The Meridian Data Processing Addendum, including the Standard Contractual
  Clauses where applicable, governs the processing of Customer Personal Data.
  Meridian will delete or return Customer Personal Data within thirty (30) days of
  termination. Customer may audit Meridian's compliance with the DPA no more than
  once per twelve (12) month period, on at least thirty (30) days' prior written
  notice, during business hours, subject to Meridian's confidentiality and
  security requirements.
unacceptable_patterns:
  - "audit .{0,30}at any time"
  - "audit .{0,20}upon request"
  - "delete .{0,30}within 7 days"
  - "unlimited audit"
pattern_severity:
  "audit .{0,30}at any time": major
  "audit .{0,20}upon request": major
  "delete .{0,30}within 7 days": major
  "unlimited audit": major
---

# Data Protection and Audit

## Position: preferred (Meridian DPA); counterparty over-reach is a major

## What a bad redline looks like

- "Customer may **audit** Supplier's facilities and records **at any time** upon
  request." → major
- "**Unlimited audit** rights." → major
- "Supplier shall **delete** all Customer Data **within 7 days** of any request."
  → major

## Fallback ladder

See `../guidance.md` § Data protection and audit. Meridian DPA + SCCs → Customer
DPA if deletion >= 30 days and audit <= 1x/year with 30 days' notice → a second
incident-triggered audit for regulated customers at their cost.
