---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Clause — Payment Terms
clause_id: payment-terms
topic: Payment Terms
position: acceptable
rationale: >-
  Standard payment terms are Net-30 from invoice date, with late amounts accruing
  interest at 1.5% per month (or the maximum permitted by law, if lower). Net-45
  is acceptable for a customer with a documented AP cycle. Net-60 or longer is a
  MAJOR issue and is only allowed above $500k ACV with CFO approval. Removal of
  the late-payment interest provision ("no interest," "interest shall not
  accrue") is also a MAJOR and requires VP Sales approval. None of these are
  blockers, but none can be accepted without the named approval.
standard_language: >-
  Customer shall pay each undisputed invoice within thirty (30) days of the
  invoice date. Amounts not paid when due accrue interest at the lesser of 1.5%
  per month or the maximum rate permitted by law, from the due date until paid.
unacceptable_patterns:
  - "net-60"
  - "net 60"
  - "net 90"
  - "payment within ninety"
  - "no interest"
  - "interest shall not accrue"
pattern_severity:
  "net-60": major
  "net 60": major
  "net 90": major
  "payment within ninety": major
  "no interest": major
  "interest shall not accrue": major
---

# Payment Terms

## Position: acceptable at Net-30; Net-60+ or no-interest is a major

## What a bad redline looks like

- "Customer shall pay each invoice within sixty (60) days." / "**Net-60**." →
  major
- "**Net 90**" / "**payment within ninety** (90) days" → major
- "**No interest** shall accrue on late payments." / "**interest shall not
  accrue**." → major

## Fallback ladder

See `../guidance.md` § Payment terms. Net-30 → Net-45 for a documented AP cycle →
Net-60 only above $500k with CFO approval; the interest provision always stays.
