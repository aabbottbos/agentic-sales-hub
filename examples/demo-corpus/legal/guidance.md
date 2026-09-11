---
fictional: true
mutability: canonical
schema_version: "1.0.0"
created: "2026-03-01T00:00:00Z"
title: Legal guidance — negotiation positions and red lines
positions:
  - topic: Indemnification
    red_line: No uncapped indemnity of any kind. IP-infringement indemnity is capped at fees paid in the trailing twelve months, same as everything else.
    fallback_ladder:
      - Mutual indemnification, each capped at trailing-12-months fees.
      - Meridian indemnifies for third-party IP claims arising from the platform, capped at trailing-12-months fees, with standard exclusions (customer data, customer modifications, combination with non-Meridian products).
      - Super-cap of 2x trailing-12-months fees for IP claims only, if the deal is above $500k ACV and VP Legal approves.
  - topic: Limitation of liability
    red_line: Aggregate liability is capped at fees paid in the trailing twelve months. The consequential-damages waiver is mutual and stays in. No carve-outs that reintroduce unlimited liability through the back door.
    fallback_ladder:
      - Standard mutual cap at trailing-12-months fees; mutual consequential waiver.
      - Cap at the greater of trailing-12-months fees or total fees paid, for deals above $500k ACV.
      - Narrow, mutual carve-outs from the cap for breach of confidentiality and indemnification obligations ONLY — never for "gross negligence," "any breach," or delay.
  - topic: Intellectual property ownership
    red_line: Meridian owns the platform, all pre-existing materials, and all tools, know-how, and generic methodologies. The customer owns their data and any custom deliverable configuration built specifically for them under the SOW. The customer never owns any part of the platform.
    fallback_ladder:
      - Customer owns custom deliverables; Meridian retains a license to use generalized learnings.
      - Customer gets a perpetual, irrevocable license to custom connectors built under the SOW (but not ownership) if they insist.
  - topic: Termination
    red_line: No termination for convenience with immediate effect. No termination for cause without a written notice-and-cure period (30 days). On any termination, the customer pays for work performed and deliverables accepted through the termination date.
    fallback_ladder:
      - Termination for convenience with 60 days' written notice; customer pays for work performed plus non-cancellable commitments.
      - 30-day cure period for material breach; 10-day cure for payment breach.
      - For the platform subscription only, allow termination for convenience at the end of the then-current annual term with 90 days' notice.
  - topic: Data protection and audit
    red_line: The Meridian DPA governs. A customer DPA is acceptable only if it does not expand deletion SLAs below 30 days or audit rights beyond once per twelve months on reasonable notice. No "audit at any time."
    fallback_ladder:
      - Meridian DPA as-is, with SCCs where a cross-border transfer applies.
      - Customer DPA accepted if deletion SLA >= 30 days and audit <= 1x/year with 30 days' notice.
      - For a regulated customer, allow a second audit in a twelve-month period if triggered by a confirmed incident, at the customer's cost.
  - topic: Payment terms
    red_line: Net-30 from invoice date. Late payments accrue interest at 1.5% per month. Removal of the late-payment interest provision is a material change and requires VP Sales approval.
    fallback_ladder:
      - Net-30, 1.5%/month late interest.
      - Net-45 for a customer with a documented AP cycle, no change to interest.
      - Net-60 only above $500k ACV and only with CFO approval; interest provision stays.
disclaimer: This guidance and any review output produced against it are internal risk flags to support a human reviewer and Meridian's legal counsel. They are not legal advice and do not create an attorney-client relationship.
---

# Legal guidance

This is the standing position set for contract negotiation. Every position has a
**red line** (do not cross without the named approval) and a **fallback ladder**
(the order in which to give ground).

The clause library in `clause-library/` breaks each of these into a checkable
entry with the specific language patterns that are unacceptable, so that
`sow-review` can flag a redline against a concrete position rather than a vibe.

## The three that are blockers, always

1. **Uncapped indemnity** — `clause-library/indemnity.md`
2. **Removal of the liability cap, or a carve-out that reintroduces unlimited
   liability** — `clause-library/limitation-of-liability.md`
3. **Customer claiming ownership of any part of the platform** —
   `clause-library/ip-ownership.md`

## The rest

- Termination for convenience with immediate effect, or no cure period —
  `clause-library/termination.md` (blocker if immediate/no-cure; major if the
  notice period is just short).
- Audit "at any time," or a deletion SLA under 30 days —
  `clause-library/data-protection.md` (major).
- Net-60+ payment terms, or removal of late-payment interest —
  `clause-library/payment-terms.md` (major).
