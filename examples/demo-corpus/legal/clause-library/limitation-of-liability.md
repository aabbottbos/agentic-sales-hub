---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Clause — Limitation of Liability
clause_id: limitation-of-liability
topic: Limitation of Liability
position: unacceptable
rationale: >-
  Aggregate liability under the agreement is capped at fees paid in the trailing
  twelve months, and the waiver of consequential, incidental, and indirect
  damages is mutual and stays in. Two counterparty moves are blockers: (1)
  striking or raising the cap to "unlimited," and (2) inserting a carve-out that
  reintroduces unlimited liability for a broad category such as "any breach,"
  "gross negligence," or "delays." Narrow, mutual carve-outs for breach of
  confidentiality and indemnification obligations are the most Meridian will
  accept, and only per the fallback ladder in legal/guidance.md. Language making
  consequential damages recoverable, or stating that liability "shall be
  unlimited" for any category, must be flagged as a blocker.
standard_language: >-
  EXCEPT FOR EACH PARTY'S INDEMNIFICATION OBLIGATIONS AND BREACH OF
  CONFIDENTIALITY, (A) NEITHER PARTY'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR
  RELATED TO THIS AGREEMENT SHALL EXCEED THE FEES PAID OR PAYABLE BY CUSTOMER IN
  THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, AND (B)
  NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
  CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR REVENUES.
unacceptable_patterns:
  - "liability shall be unlimited"
  - "no limitation of liability"
  - "consequential damages .{0,30}recoverable"
  - "unlimited liability"
pattern_severity:
  "liability shall be unlimited": blocker
  "no limitation of liability": blocker
  "consequential damages .{0,30}recoverable": blocker
  "unlimited liability": blocker
---

# Limitation of Liability

## Position: unacceptable (as counterparties typically redline it)

The cap is trailing-twelve-months fees. The consequential-damages waiver is
mutual and stays. Carve-outs are narrow, mutual, and limited to confidentiality
and indemnification.

## What a bad redline looks like

- "Notwithstanding the foregoing, **liability shall be unlimited** for breaches
  of the confidentiality provisions." (A carve-out that removes the cap.)
- "There shall be **no limitation of liability** for delays in performance."
- "Consequential damages **shall be recoverable** by Customer."
- Deleting the entire mutual-waiver sentence.

Any of these → **blocker**, cite this file.

## Fallback ladder

See `../guidance.md` § Limitation of liability. Standard mutual cap → greater-of
cap above $500k → narrow mutual carve-outs for confidentiality and
indemnification only.
