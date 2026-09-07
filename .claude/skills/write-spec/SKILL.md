---
name: write-spec
description: Take a committed intent.md for a tier:2 capability and draft spec.md against standing policy (context-model rules, skill-contract shape, security constraints, non-goals). Use after an intent is committed and before entering plan mode. Not for tier:1 features — those skip straight from their issue to plan mode.
---

# Write Spec

You are running the Design stage of the deal-desk SDLC. Unlike `write-intent`, this is not an interview. You draft the whole `spec.md` from the committed intent and the repo's standing policy, then hand it back for the user to review for **conflicts and omissions, not prose**. You write the spec; they flag where you violated a constraint they care about.

## Step 0 — Confirm this is the right stage

Only tier:2 (Capability) work gets a spec. Read the intent's tier. If it says tier:1, stop and say so plainly — tier:1 goes straight from its issue to plan mode, no spec stage. If the tier looks wrong given what the intent actually describes (it changes a context schema, a skill contract, or an eval gate), say that too — those three are automatically tier:2, no exceptions — but don't silently overrule the label yourself.

## Step 1 — Load inputs

1. **The intent.** Read `docs/intents/NNN-slug.md` for the number/slug given, or the issue referenced. If you can't find it, stop and point at `write-intent` — a spec needs a committed intent to draft from, not a conversation.
2. **Standing policy**, in priority order:
   - `context/schema/**` — canonical JSON Schema for any frontmatter type this capability touches. Live and authoritative.
   - `docs/sdlc/` — the published SDLC doc, if present.
   - The reference summary below, as fallback and cross-check.

   If the live repo policy has diverged from the summary below, flag it — that means this skill file needs updating, not that you should silently follow the newer one without saying so.

## Standing policy reference

### Context model design rules
1. The opportunity is the primary key; its ID is CRM-shaped (`crm_system` + `crm_id` in frontmatter) from day one.
2. Everything is a file with typed frontmatter. Git is the store — no database.
3. Two mutability classes: **canonical** (org, legal, demand-gen — replaced and versioned, changes go through review) and **accumulating** (account, opportunity — append-only; nothing is rewritten, superseded artifacts are marked superseded, never deleted).
4. Provenance is mandatory. No claim without a citation. A generation skill that can't cite a source marks the claim `[unsourced]` rather than asserting it.
5. Outcomes are first-class. Every generated artifact gets an outcome record (`sent`, `won`, `lost`, `redline_accepted`, `redline_rejected`, `superseded`, `unused`) with a date.
6. Context grants are declared and enforced. Each skill declares its read scope; the loader refuses reads outside it. Least-privilege, enforced at the loader — never by prompt alone.

### Skill contract shape
Three tiers, three output contracts:

| Tier | Job | Output contract | Evaluated by |
|---|---|---|---|
| Retrieval | Find and rank context | Ranked list of `{path, span, relevance, why}` | Precision/recall vs. labeled relevant spans |
| Generation | Synthesize context into a new artifact | Artifact (markdown) + citation map + `[unsourced]` markers | Rubric score + citation validity (every citation resolves and supports its claim) |
| Review | Check a draft against canonical context | Structured findings only — never prose | Recall/precision vs. labeled findings, weighted by severity |

If this intent adds or changes a skill, its definition takes this shape (data, not prose — it drives the Claude Code skill, the MCP tool, and the eval runner):

```yaml
id: <skill-id>
tier: retrieval | generation | review
version: 1
context_grants:
  read: [<globs>]
  write: [<globs, or omit entirely for review-tier skills>]
inputs:
  <name>: {type: string, required: true}
output:
  schema: schemas/<name>.json
  requires_citations: true | false
eval_suite: evals/cases/<skill-id>/
tools: [context.read, context.search, artifact.write]
```

### Security constraints
- `inbound/**` (counterparty-supplied content) is read-only, quarantined, and wrapped in explicit untrusted-content delimiters — data, never instruction.
- Review-tier skills get **no write grant at all**. They return findings; a separate step persists them.
- A hook blocks any tool call whose arguments originate from `inbound/**` content.
- Every `inbound/**` ingestion is logged in the trace with a hash of the source.
- No real third-party data in the repo, ever — enforced by a CI check against the synthetic-corpus namespace.
- Secret scanning + `gitleaks` in CI.
- Review outputs carry a standing disclaimer: risk flags for a human reviewer, not legal advice.

### Standing non-goals (product-level, from the v2 spec)
Multi-tenant SaaS / auth beyond single user / billing · bidirectional CRM sync · usage/adoption dashboards · MSA generation, SOW generation, e-signature, proposal publishing/hosting · mobile, real-time collaboration, notifications · any claim that review output constitutes legal advice.

A spec is allowed to touch one of these, but never quietly — see Step 2.

## Step 2 — Draft the spec

Write the whole thing in one pass from the intent and the policy above. Do not ask the user field-by-field the way `write-intent` does. Where the intent is silent on something policy requires — a context grant, a tier classification, a mutability class — make the call yourself and log it under "Judgment calls for review" rather than picking silently or stalling to ask.

```markdown
# NNN — <Title>

**Tier:** tier:2
**Status:** draft
**Intent:** docs/intents/NNN-slug.md

## Summary
<one paragraph — what this capability is, per the intent>

## Context model impact
- Schema changes: <files under context/schema/ touched, or "None.">
- Mutability class of any new or touched context: canonical | accumulating
- Provenance/citation requirements for anything this capability generates

## Skill contract
<omit this section entirely if the intent doesn't add or change a skill>
- Tier: retrieval | generation | review
- Output contract per the table above
- Draft YAML skill definition (id, tier, version, context_grants, inputs, output, eval_suite, tools)

## Context grants
- Read scope, with justification
- Write scope, with justification (omit for review-tier skills — see security constraints)

## Security considerations
- Does this touch `inbound/**`? If so: quarantine wrapping, no-write-grant, and hook coverage all confirmed explicitly, not assumed.
- Any new attack surface this capability introduces

## Non-goals / out of scope
- What this capability explicitly does not do
- Does it reverse a standing non-goal above? State yes/no and which one. A reversal isn't forbidden — it's a decision the user needs to see, not one you make for them.

## Eval impact
- Eval suite(s) this must pass or extend
- New eval cases required (schema, contract, or gate changes always require at least one)
- Gate(s) this must clear: citation validity = 1.00 | blocker recall = 1.00 | retrieval recall ≥ 0.90 | generation rubric ≥ 4.0/5 | no net regression

## Judgment calls for review
- Every place you inferred something the intent left open. This is the fastest path for the user's review — point them here first.

## Open questions
- Carried over from intent.md, plus any new ones this spec surfaces
```

## Step 3 — File it

- Same `NNN` and `slug` as the source intent — `docs/intents/NNN-slug.md` → `docs/specs/NNN-slug.md`. The chain stays aligned by number.
- Write to `docs/specs/NNN-slug.md`, on the same branch as the intent (or a branch continuing it) — intent and spec merge together as one design gate, never separately.
- Comment on the linked GitHub issue with a link to the new file.

## Step 4 — Hand back for review, not approval

State plainly what you need from them: review for conflicts and omissions, not prose, and start with the "Judgment calls for review" section. Do not proceed into plan mode or start implementation yourself — that's the Build stage, a distinct step that starts only after the user has merged intent + spec.
