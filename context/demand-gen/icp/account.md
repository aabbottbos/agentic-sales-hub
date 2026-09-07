---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-02-10T00:00:00Z"
title: ICP — account
firmographics:
  size: 500–5,000 employees; $75M–$1.5B annual revenue
  industries:
    - Third-party logistics (3PL) and freight brokerage
    - Wholesale distribution
    - Multi-location retail and e-commerce fulfillment
  geos:
    - United States
    - Canada
disqualifiers:
  - Under $50M revenue (services engagement is disproportionate to deal size; sell platform-only or pass)
  - Pure software buyer with a mandate to self-implement and no services budget
  - Needs a TMS or WMS (transportation execution, rate shopping, load tendering, warehouse management) — we integrate those, we are not one
  - No API or test-data access to the systems that hold their shipment/order data
  - Single-site operation with low shipment volume (the exception queue is not busy enough to change behavior)
---

# ICP — account

## Who buys

Mid-market companies whose operations run on **shipments and orders moving
between locations and partners**, who have felt the pain of scattered status
data, and who have the budget and appetite for a scoped services engagement.

The three industries in the frontmatter are where the exception-first data model
and the pre-built connector set line up. Freight brokerage is the sharpest fit
(carrier onboarding pain), distribution is the largest deals (integration
complexity), retail is the fastest sales cycle (lean services scope).

## The strongest signal

**A stalled or failed prior visibility project.** A company that bought a
software-only tool and couldn't get it integrated is our best prospect — see
`../../org/evidence/cs-portside-distribution.md`. The objection ("we tried this")
is actually the qualifier.

## Hard disqualifiers

See frontmatter. The two that get missed most: **companies under $50M revenue**
(the services engagement doesn't pencil) and **companies that actually need a
TMS/WMS** (they will churn when they realize we don't do execution).
