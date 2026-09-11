---
fictional: true
mutability: accumulating
schema_version: "1.0.0"
created: "2026-08-04T00:00:00Z"
title: Call-prep brief — Acme demo + technical review (2026-08-05)
artifact_id: a-0001
kind: brief
generated_by: call-prep
superseded: false
citations:
  - claim: Acme's prior visibility pilot stalled at TMS integration, which is the objection to answer.
    path: context/accounts/acme-logistics/account.md
    span: [520, 900]
  - claim: The services engagement is the differentiator — scoped, priced, committed up front.
    path: context/org/company.md
    span: [520, 780]
  - claim: The champion (Dana) does not want her team to run the implementation.
    path: context/accounts/acme-logistics/people/dana-reyes.md
    span: [560, 760]
  - claim: Reference to use is Midwest Freight — same industry, same carrier-onboarding pain.
    path: context/org/evidence/cs-midwest-freight.md
    span: [0, 300]
---

# Call-prep brief — Acme demo + technical review

**Meeting:** 2026-08-05, platform demo + technical review.
**Attendees expected:** Dana Reyes (champion), an ops lead, Acme IT (first time),
possibly the CFO.

## Goal of this call

Get IT comfortable with the integration, and put a concrete SOW shape + number in
Dana's hands to take to the CFO.

## What we know

- **Prior failure with FreightWatch** — 3-month pilot, never went to prod,
  stalled at TMS integration. This is the objection: "we bought this once." The
  answer is the scoped services engagement.
- **Champion is Dana Reyes**, VP Supply Chain. Wants one exception queue and does
  not want her team running an implementation.
- **Carrier onboarding** is the pain metric — slow, "weeks," need the exact
  number this call.
- **Environment:** supported TMS (connector exists), NetSuite, EDI VAN, a custom
  carrier-scorecard tool (would be a connector build).

## Talking points

1. Run the exception queue live on brokerage-shaped data.
2. Show carrier self-serve onboarding in the partner portal — tie directly to
   their weeks-long onboarding problem.
3. For IT: the written integration design comes before any build; two custom
   connectors are included; be precise about what their team must provide.
4. Reference: Midwest Freight — freight broker, cut carrier onboarding ~40% with
   the platform plus a services engagement that built the connectors.

## Risks

- IT capacity is thin — get specific on their obligations so it's not a surprise.
- CFO may join and open the "why is services so expensive" objection — have the
  Cascade payback framing ready.
