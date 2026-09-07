---
name: Intent template
about: Intent for products and or features
title: ''
labels: ''
assignees: ''

---

name: Intent
description: >-
  Open the Plan stage of the SDLC. Use this for anything above a T0 chore —
  the write-intent skill will interview you and turn this into docs/intents/NNN-slug.md.
title: "[Intent]: "
labels:
  - intent
body:
  - type: markdown
    attributes:
      value: |
        ### Before you file this
        - **T0 chores** (dep bump, typo, formatting, test flake) don't need an intent — open a PR directly.
        - Anything that changes the **context schema**, a **skill contract**, or an **eval gate** is automatically **T2**, no exceptions.
        - Fill in what you can here; run the `write-intent` skill afterward to synthesize the full `intent.md`.

  - type: dropdown
    id: tier
    attributes:
      label: Work tier
      description: How much ceremony does this need? See docs/sdlc for the full tier table.
      options:
        - "tier:1 — Feature (plan.md only)"
        - "tier:2 — Capability (full chain: intent → spec → plan)"
    validations:
      required: true

  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What's broken, missing, or costing you time right now? Be concrete.
      placeholder: e.g. call-prep briefs cite account context that's stale by the time the rep is in the room
    validations:
      required: true

  - type: textarea
    id: proposed-outcome
    attributes:
      label: Proposed outcome
      description: What does the world look like once this is done?
    validations:
      required: true

  - type: textarea
    id: who-it-affects
    attributes:
      label: Who it affects
      description: Which skills, surfaces, or people (you, a rep, a reviewer) touch this?
    validations:
      required: true

  - type: textarea
    id: constraints
    attributes:
      label: Constraints
      description: Known limits — technical, time, budget, or policy (e.g. context grants, eval gates).
    validations:
      required: false

  - type: textarea
    id: open-questions
    attributes:
      label: Open questions
      description: What's still unresolved that the spec stage needs to settle?
    validations:
      required: false

  - type: textarea
    id: success-criteria
    attributes:
      label: How we'll know it worked
      description: >-
        The field people skip and the one that makes the rest testable.
        Name a metric, an eval gate, or a concrete observable outcome — not a vibe.
      placeholder: e.g. citation validity stays 1.00 and retrieval recall on call-prep rises to ≥0.90
    validations:
      required: true

  - type: checkboxes
    id: solo-discipline
    attributes:
      label: Solo discipline
      description: Optional, but the whole point of the tier-2 chain.
      options:
        - label: I wrote this, closed the laptop, and I'm approving it in a separate session.
          required: false
