---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2025-12-05T00:00:00Z"
title: Cascade Retail Group — exception management across 40 store-fulfillment locations
case_study_id: cs-cascade-retail
industry: Multi-location retail / e-commerce fulfillment
situation: A specialty retailer fulfilling e-commerce orders from 40 stores plus one DC had no way to see which store-fulfilled orders were at risk of missing their promised ship date. Customer-service agents found out about problems from customer emails. The CFO was skeptical that a platform plus a services engagement was worth it versus hiring two more ops analysts.
solution: Meridian Grid Platform for the central fulfillment-ops team and CS leads, with a deliberately lean Implementation Services engagement — no custom connectors (the retailer was on a supported OMS), a 6-week integration phase, and exception workflows focused on a single exception type to start (at-risk ship date) with a plan to expand after go-live. The lean scope was itself the answer to the CFO's "is this worth it" objection.
outcome_metrics:
  - metric: At-risk orders caught before the customer noticed
    value: 12% to 68%
  - metric: CS tickets originating from a shipping surprise
    value: Down 34% quarter over quarter
  - metric: Services engagement size
    value: $95k fixed (deliberately lean — no custom connectors, single exception type at launch)
reference_ok: false
---

# Cascade Retail Group

> **Reference status:** Cascade is a strong outcome story but is **not** a
> take-a-call reference — their legal team declined the reference clause. Use the
> metrics and the narrative; do not offer a Cascade contact.

## The pain

Cascade fulfilled e-commerce from 40 stores and one DC and had **no line of
sight** into which store-fulfilled orders were about to miss their promised ship
date. CS agents learned about problems from angry customer emails. The economic
buyer — the CFO — was openly skeptical: why not just hire two more ops analysts?

## What we did

We answered the CFO objection with **scope discipline**:

- **No custom connectors** — Cascade was on a supported OMS, so integration was
  configuration.
- **6-week integration phase**, the shortest we scope.
- **One exception type at launch** — at-risk ship date — with an explicit
  post-go-live plan to add short-ship and carrier-delay workflows once the team
  had adopted the first one.
- Total services: **$95k fixed**, framed against the fully-loaded cost of the two
  analysts the CFO was considering.

## Results

- **At-risk orders caught before the customer noticed: 12% to 68%.**
- **CS tickets from a shipping surprise down 34%** quarter over quarter.
- Cascade expanded to short-ship and carrier-delay workflows six months later on
  a small change order.

## Why this deal is a good proof point

It is the CFO-skepticism deal. The win was a *lean* services scope, sized to
prove value fast, not a big-bang engagement. It also shows we will scope small
when that is the right call — the services attach is not a way to inflate the
deal.
