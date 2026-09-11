# Agentic Sales Hub — North Star

**Date:** 2026-09-11 · **Owner:** Andrew Abbott
**Governs:** `AgenticSalesHub_Spec_v2.md`, `AgenticSalesHub_Spec_v2-Adoptability-Addendum.md`, `AgenticSalesHub_AI-SDLC-Framework_v1.md`

This is the document the other three defer to. When a scope question can't be settled inside a spec, it gets settled here.

---

## 1. The thesis

> **Sales work should compound, and the context substrate is what makes it compound.**
>
> Today every call, proposal, and redline evaporates the moment it's used. The org re-derives the same knowledge on every deal, and the seller is the integration layer doing it by hand.
>
> An AI-native sales org treats accumulated context as the system of record — not the CRM, not the org chart. Skills read it. Agents act on it. Every conversation, artifact, and outcome feeds back into it. The result isn't just better output; it's a **capability surface that grows**. Work that wasn't automatable at all becomes automatable once the context exists to ground it.

Two claims, both load-bearing:

1. **Sales work should compound.** The 40th deal must be measurably better-equipped than the 4th, and you should be able to prove it with a number.
2. **The context substrate is the org.** Roles become skills that read a shared substrate. Ramping, quality control, and consistency all become context problems rather than management problems.

### The earned insight

The thesis comes from something observed, not theorized:

> Skills accelerate productivity on their own. When you augment them with real organizational context, two things happen — the existing skills get materially better, **and new skills become possible that weren't viable before**, reaching both further up the funnel and further into delivery.

That second half is the non-obvious part and it's the whole argument. Most people treat AI context as an accuracy problem — better inputs, better outputs, diminishing returns. It isn't. Context expands the *set of work that can be automated at all*. That's why "compounding" here means growing capability, not just rising quality, and it's why a context-first architecture beats a skill-first one.

---

## 2. What this is for — in priority order

These are not three equal goals. The order is the whole point.

| | | Status |
|---|---|---|
| **1. The goal** | A Director+ role where this work is why they hired me. | Everything else is judged by whether it serves this. |
| **2. The instrument** | An open-source system on GitHub — skills, agents, context spec, evals. | Exists to prove the thesis was earned rather than borrowed. Gets cut where it stops serving #1. |
| **3. The experiment** | A managed service — hosting, onboarding, dashboards, storage. | **Deferred, not dead.** No infrastructure work in Q4. |

**On the managed service.** Its value to the goal is the *demand signal*, not the platform. "Four sales orgs installed it and two asked me to host it" is a stronger interview line than a working billing integration, and it costs nothing to collect. Build the signal; defer the service.

**Trigger to revisit:** three organizations that aren't mine have run it on their own context and come back with a feature request. Until then it stays a line in the README.

---

## 3. Who this is for

Target roles are deliberately flexible across three shapes: **GTM lead at an AI company**, **sales leader at a SaaS company**, and **AI/GTM transformation leadership**.

They share one thing, and it's a design constraint: **the hiring manager is a revenue person, not an engineer.**

That forces a two-layer artifact:

- **Top layer** — a VP of Sales understands why this matters in five minutes. Revenue language, deal outcomes, a number.
- **Proof layer** — a technical evaluator can verify it's real in twenty. Evals, provenance, the context spec, commit history.

The repo today is all proof layer. That is a packaging gap, and it's cheap to close if it's designed in rather than bolted on in December.

---

## 4. Scope: org-wide thesis, seller-deep proof

The thesis covers a whole revenue org — top of funnel through delivery. The working system proves **one slice to a depth nobody else has**.

This is the normal shape of a credible thesis and it resolves the scope pressure permanently:

| | Scope |
|---|---|
| **The writing** | The full operating model. Prospecting, deal execution, management, delivery handoff — how context flows between them and what each role's skills read. |
| **The build** | The deal spine, seller-facing, done to evaluated depth. Five skills, one setup skill, the compounding loop. |

Everything named in the writing but not built is **explicit roadmap**, named as such. Restraint that's stated reads as judgment; restraint that's silent reads as an unfinished list.

**Deferred by name:** pipeline inspection, SOW generation, CS handoff, lead gen and enrichment, dashboards, CRM integration. The strongest of these is pipeline inspection — it's a review-tier skill with the same structured-findings contract as `sow-review`, and it's the capability the sales-leader audience would respond to most. It is the first thing to build after the job search closes.

---

## 5. How we'll know it worked

**The primary metric: evidence reuse rate.**

> What share of the material claims in a generated artifact trace to context that preceded a closed-won deal?

Chosen because it is the number a revenue leader understands instantly, and because it is the only metric that makes the compounding claim falsifiable. If reuse rate doesn't rise as the deal record grows, the thesis is wrong and we'd know.

**This has a corpus requirement that is not currently in the plan.** Reuse rate needs closed deals to reuse *from*. At least two opportunities in the expanded corpus must be closed-won or closed-lost, with their artifacts and outcome records populated. Otherwise the metric has nothing to measure and the demo has no number in it.

**The gates that stay non-negotiable** (from Spec v2 §8): blocker recall 1.00, citation validity 1.00, retrieval recall ≥ 0.90, generation rubric ≥ 4.0/5, no net regression. These are not in tension with the goal — they *are* the proof layer.

**And the one qualitative test:** a revenue leader watches the demo and asks a question about their own org rather than about the technology.

---

## 6. Decision rules

When something is ambiguous, resolve it in this order.

1. **The thesis is the deliverable. The code is the evidence.** When they compete for time, the thesis wins. The claim chosen — *I know how AI sales orgs should run* — is defended with a point of view; the repo proves the opinion was earned.
2. **Org-wide in the writing, seller-deep in the build.** A capability that only appears in the document is not scope creep. A capability that appears in the backlog is.
3. **A feature earns its place only if it demonstrates compounding or makes the demo legible to a revenue leader.** Everything else is roadmap.
4. **Revenue legibility beats engineering legibility — but both layers must exist.** A demo an engineer admires and a CRO can't follow has failed at the goal.
5. **If a customization can't be expressed as a schema-validated file, it's a fork.** (Carried from the amendment; still the rule that keeps the surface supportable.)
6. **Never weaken an eval gate to make something ship.** The gates are the differentiator, not the obstacle.

---

## 7. Sequencing consequence — the writeup comes first

Interviews start October–November. The build plan publishes in late December. That gap is the single largest risk in this effort, and the resolution is not to cut the build.

**Publish the thesis in October, with a partially-built system underneath it.**

Most of the document already exists across Spec v2, the SDLC framework, and the adoptability amendment. The claim doesn't require a finished product — it requires a defensible point of view and enough working evidence that the reader believes it came from doing rather than reading. A 60%-built system with real evals and a live commit history clears that bar easily.

**Distribution is one long writeup plus a ≤5-minute demo video**, sent directly into conversations. No audience-building campaign; the artifact is the thing that gets attached to an application and walked through in a room.

This inverts Spec v2 §11, which reserved the writeup for Phase 3. It moves to first.

---

## 8. What this is not

- Not a proposal generator, a contract reviewer, or a call-prep tool. Those exist and are crowded. This is the context layer underneath all of them.
- Not multi-tenant SaaS. One repo per organization.
- Not a CRM, and not integrated with one. CRM-shaped IDs are the seam; the integration is permanently deferred.
- Not a dashboard product. The CRM already has dashboards, and that's the correct answer when someone asks.
- Not legal advice, and review output says so.
- Not a claim of empty market space. The claim is context consolidation, and it's defensible precisely because it concedes the point solutions exist.

---

## 9. What failure looks like

Named in advance, because each has a control.

| Failure | Control |
|---|---|
| Interviews happen with nothing to show | Thesis published in October, ahead of the build |
| The org-wide thesis quietly rewrites the build plan | Decision rule 2; roadmap items named explicitly in the README |
| "Compounding" stays a vibe because the metric never gets built | Reuse rate is a gate, and the corpus gets closed deals to support it |
| Beautiful process, no product | SDLC framework §11 — if the process isn't producing merged product PRs, cut it back |
| A demo an engineer loves and a CRO can't follow | Two-layer packaging, designed in from now |
| The managed service eats Q4 | No infrastructure until the three-org trigger fires |

---

## 10. What changes in the current plan

Three deltas for the adoptability amendment, to be specced properly rather than folded in silently:

1. **New work item — the compounding loop.** Outcome-weighted retrieval extending `find-evidence`, plus reuse rate as a scored, gated metric. This is the only capability addition from this session.
2. **WI-4 corpus expansion gains a requirement.** At least two of the added opportunities close, with artifacts and outcome records populated.
3. **The writeup moves ahead of the build.** Spec v2 §11 Phase 3 sequencing is superseded by §7 above.

---

*Companion documents: `AgenticSalesHub_Spec_v2.md` (what gets built) · `AgenticSalesHub_Spec_v2-Adoptability-Addendum.md` (the implementation spec) · `AgenticSalesHub_AI-SDLC-Framework_v1.md` (how it gets built).*
