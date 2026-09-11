---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-01-15T00:00:00Z"
title: Meridian Grid Platform
offering_id: platform
summary: SaaS platform for shipment and order visibility, exception management, and partner collaboration across the mid-market supply-chain stack.
scope_includes:
  - Shipment and order tracking with a unified exception queue
  - Pre-built connectors for NetSuite, major TMS/WMS systems, and EDI VANs
  - Partner portals for carriers, suppliers, and 3PL customers
  - Configurable alerting, SLA tracking, and exception-resolution workflows
  - Standard reporting and a read-only analytics API
scope_excludes:
  - Custom connector development (that is an Implementation Services line item)
  - On-premise deployment (SaaS only)
  - Transportation execution / rate shopping / load tendering (we integrate a TMS, we are not one)
  - Warehouse management (we integrate a WMS, we are not one)
services_attach: false
---

# Meridian Grid Platform

The platform is the core product. It is organized around **exceptions** — the
late shipment, the short order, the missed pickup, the EDI reject — because that
is what supply-chain teams spend their day chasing.

## Pricing shape

- **Per seat**, tiered by role (operational user vs. read-only/partner).
- **Data-volume component**, priced per thousand shipment-or-order events per
  month, with a committed monthly minimum.
- Annual contract, billed annually or quarterly. See `../pricing.md`.

## Scope boundaries that matter in deals

- We are **not a TMS or WMS.** We integrate them. When a prospect asks for rate
  shopping or load tendering, that is a disqualifier for the platform as-is.
- **Custom connectors are services**, not platform. If a prospect's TMS is not on
  the pre-built list, that is an Implementation Services scope item with its own
  estimate — it does not change platform pricing.
- **Analytics is read-only.** We expose an API and standard reports. We do not
  build custom dashboards as part of platform; bespoke reporting is a services
  engagement.
