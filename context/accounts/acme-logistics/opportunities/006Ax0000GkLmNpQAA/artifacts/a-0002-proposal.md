---
fictional: true
mutability: accumulating
schema_version: "1.0.0"
created: "2026-08-20T00:00:00Z"
title: Proposal draft — Acme Logistics (pre-restructure)
artifact_id: a-0002
kind: proposal
generated_by: proposal-draft
superseded: true
citations:
  - claim: Platform pricing is per operational seat, per partner seat, plus a data-volume minimum.
    path: context/org/pricing.md
    span: [520, 900]
  - claim: The implementation engagement is fixed-scope with a not-to-exceed and change-order discipline.
    path: context/org/offerings/implementation-services.md
    span: [640, 1000]
  - claim: Discount authority — 12% platform discount is within AE/VP authority; services floor is 15%.
    path: context/org/pricing.md
    span: [1180, 1520]
  - claim: Payback framing for the CFO comes from the Cascade Retail engagement.
    path: context/org/evidence/cs-cascade-retail.md
    span: [0, 320]
---

# Proposal — Acme Logistics

> **Superseded 2026-08-28.** This draft priced services as a single $180k NTE
> with the carrier-scorecard connector included. The negotiated structure moves
> the scorecard connector to a change order (base SOW ~$150k + scorecard CO
> ~$30k). See `../meetings/2026-08-28-negotiation.md`. A new proposal draft
> supersedes this one.

## Commercial summary (as of this draft)

| Line | Detail | Annual |
|---|---|---|
| Platform — operational seats | 40 @ $145/mo, less 12% | ~$61,000 |
| Platform — partner seats | 150 @ $35/mo, less 12% | ~$55,000 |
| Platform — data volume | ~$5,000/mo minimum, less 12% | ~$53,000 |
| Platform subtotal | | **~$300,000 → ~$264,000 after 12%** |
| Implementation Services | Fixed NTE, all connectors included | **$180,000** |
| **Total** | | **~$444,000** |

## Implementation scope (this draft)

Discovery → TMS connector configuration → carrier-scorecard **custom connector
build** → NetSuite → 13-month backfill → exception workflows (5 types) → training
→ 30-day hypercare. Fixed not-to-exceed; overage requires a signed change order.

## For the CFO

The services engagement gets Acme live on their own data in ~12 weeks against a
capped price. Compare to the alternative Pat raised — two ops analysts — where
the cost is recurring and open-ended and the integration risk stays with Acme.
This is the Cascade Retail pattern: a scoped engagement sized to prove value
fast.
