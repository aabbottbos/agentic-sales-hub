---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Clause — Intellectual Property Ownership
clause_id: ip-ownership
topic: Intellectual Property Ownership
position: acceptable
rationale: >-
  Meridian's standard IP allocation is acceptable to most counterparties: Customer
  owns Customer Data and any custom configuration or connector built specifically
  for them under the SOW; Meridian owns and retains all rights in the Platform,
  all pre-existing materials, and all generic tools, know-how, and methodologies.
  The BLOCKER case is a counterparty redline that sweeps the Platform itself into
  Customer ownership — language assigning "all intellectual property" to Customer
  "including the Platform," or making work product "including the Platform" a
  work made for hire. That is a blocker regardless of deal size and cannot be
  accepted. A narrower over-reach (Customer claims ownership of generalized
  learnings, or of the methodology) is a major, not a blocker, and is handled on
  the fallback ladder.
standard_language: >-
  Customer owns Customer Data and the specific deliverable configurations and
  custom connectors developed for Customer under a SOW. Meridian owns and retains
  all right, title, and interest in and to the Platform, all Meridian pre-existing
  materials, and all tools, libraries, know-how, and methodologies, including any
  generalized improvements conceived during an engagement. Nothing in this
  Agreement transfers any ownership interest in the Platform to Customer.
unacceptable_patterns:
  - "all intellectual property .{0,160}owned by [Cc]ustomer"
  - "including the [Pp]latform"
  - "work made for hire .{0,40}[Pp]latform"
pattern_severity:
  "all intellectual property .{0,160}owned by [Cc]ustomer": blocker
  "including the [Pp]latform": blocker
  "work made for hire .{0,40}[Pp]latform": blocker
---

# Intellectual Property Ownership

## Position: acceptable as written; blocker when the counterparty over-reaches to the Platform

Meridian's standard split is fine. The line that must never move: **the customer
never owns any part of the Platform.**

## What a bad redline looks like

- "All intellectual property created under this Agreement shall be **owned by
  Customer**, **including the Platform** and all components thereof."
- "All work product, **including the Platform**, is a **work made for hire**."
- Deleting "Nothing in this Agreement transfers any ownership interest in the
  Platform to Customer."

Any of these → **blocker**, cite this file.

A softer over-reach (Customer wants to own "generalized learnings" or the
methodology) is a **major**, negotiated on the fallback ladder in
`../guidance.md` § Intellectual property ownership.
