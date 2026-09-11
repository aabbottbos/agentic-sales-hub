---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Clause — Termination
clause_id: termination
topic: Termination
position: acceptable
rationale: >-
  Meridian's standard termination terms are acceptable: no termination for
  convenience with immediate effect; a 30-day written notice-and-cure period for
  material breach (10 days for payment breach); and on any termination, Customer
  pays for work performed and deliverables accepted through the termination date.
  BLOCKER cases: (1) termination for convenience "with immediate effect" or
  "immediately," (2) removal of the cure period ("without cure," "no cure
  period"), and (3) "no payment for work performed" on termination. A merely
  short notice period (e.g. 15 days instead of 30) is a MAJOR, not a blocker.
  Acceptance-criteria language giving Customer "sole discretion" to reject a
  deliverable with no cure path is functionally a termination-for-convenience
  loophole and is a MAJOR, cited to this clause's cure-period rationale.
standard_language: >-
  Either party may terminate this Agreement or a SOW for material breach that
  remains uncured thirty (30) days after written notice (ten (10) days for a
  payment breach). Customer may terminate a SOW for convenience on sixty (60)
  days' written notice, in which case Customer shall pay for all work performed
  and deliverables accepted through the effective date of termination plus any
  non-cancellable third-party commitments. Deliverables are deemed accepted if
  Customer does not provide written notice of non-conformance with the applicable
  acceptance criteria within ten (10) business days, and Meridian shall have a
  thirty (30) day period to cure any noticed non-conformance.
unacceptable_patterns:
  - "terminate .{0,40}immediately"
  - "termination for convenience .{0,30}immediate"
  - "without cure"
  - "no cure period"
  - "no payment for work performed"
  - "sole discretion of (the )?[Cc]ustomer"
pattern_severity:
  "terminate .{0,40}immediately": blocker
  "termination for convenience .{0,30}immediate": blocker
  "without cure": blocker
  "no cure period": blocker
  "no payment for work performed": blocker
  "sole discretion of (the )?[Cc]ustomer": major
---

# Termination

## Position: acceptable as written; blockers on immediate/no-cure/no-payment

## What a bad redline looks like

- "Customer may **terminate** this Agreement for convenience **immediately** upon
  written notice." → blocker
- "...for material breach, **without cure**." / "There shall be **no cure
  period**." → blocker
- "Upon termination, **no payment for work performed** shall be due." → blocker
- "Acceptance of each deliverable is at the **sole discretion of the Customer**."
  (no cure path) → **major**, cite the cure-period rationale in this file.

## Fallback ladder

See `../guidance.md` § Termination. Convenience with 60 days' notice → 30-day
cure / 10-day payment cure → platform-subscription convenience at end of term
with 90 days' notice.
