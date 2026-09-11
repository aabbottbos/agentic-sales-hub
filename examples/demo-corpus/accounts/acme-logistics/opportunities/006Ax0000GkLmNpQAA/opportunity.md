---
fictional: true
mutability: accumulating
schema_version: "1.0.0"
created: "2026-07-14T00:00:00Z"
title: Acme Logistics — Platform + Implementation Services
crm_system: salesforce
crm_id: "006Ax0000GkLmNpQAA"
stage: Negotiation
amount: 480000
close_date: "2026-12-15"
competitors:
  - FreightWatch (incumbent-ish — Acme ran a failed pilot with them 18 months ago)
  - "Build internal (Pat Morgan's alternative: hire 2 ops analysts)"
---

# Acme Logistics — Platform + Implementation Services

## Shape of the deal

| Component | Detail |
|---|---|
| Platform | 40 operational seats, 150 partner seats, data-volume min ~$5,000/mo |
| Services | Implementation SOW: discovery, TMS connector config (pre-built), carrier-scorecard custom connector (1 of 2 included), 13-month backfill, exception workflows for 5 types, training, 30-day hypercare |
| ACV | ~$480,000 (≈$300k platform, ≈$180k services NTE) |
| Stage | Negotiation — commercial terms mostly agreed; counterparty legal redlined the MSA and SOW on 2026-09-02 and 2026-09-04 |
| Close target | 2026-12-15 (Dana wants go-live before peak; see meeting notes for the moving go-live date) |

## Where it stands (as of 2026-08-28)

- **Dana Reyes (champion)** is sold. Selling internally to Pat.
- **Pat Morgan (CFO)** is at "yes if the number comes down and the scope is
  real." Discounting is within AE/VP authority so far.
- **Legal** is the live issue: the counterparty MSA and SOW redlines (in
  `inbound/`) contain three blocker-level clauses plus several majors. This is
  the gate to close, not price.

## Competitive context

- **FreightWatch** is the ghost in the room — Acme's failed pilot was with them.
  Our wedge is exactly the thing FreightWatch didn't deliver: a scoped,
  committed integration.
- **"Build internal"** is Pat's BATNA. Countered with the Cascade Retail payback
  framing.
