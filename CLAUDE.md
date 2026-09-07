# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repo is **pre-build**. It contains the solution spec and the SDLC framework, plus scaffolding directories (`.claude/`, `docs/`, `evals/`). There is no application code, no `package.json`, and no build/test tooling yet. When something below refers to `pnpm ...`, `packages/`, `apps/surface/`, `context/`, or a skill/eval, that is the *planned* structure from the spec — check whether it exists before assuming it does.

Two documents are the source of truth and should be read before any non-trivial work:

- `docs/AgenticSalesHub_Spec_v2.md` — what is being built and why. Positioning, the context model (§4, the core IP), skill contracts (§5), architecture (§6), evaluation strategy (§8), trust/security (§9), phasing (§11).
- `docs/AgenticSalesHub_AISDLCFramework_v1.md` — how it gets built. Stage map, work tiers, GitHub automation, the overnight loop, weekly cadence.

External name is **Deal Desk**, not "Agentic Sales Hub". The repo slug is legacy.

## What the product is

An AI-native deal desk for a single seller: the layer between "we have a meeting" and "we have signed paper". A per-opportunity context substrate (files with typed frontmatter, git as the store) plus five agents that read it — `find-evidence` (retrieval), `sow-review` (review), `call-prep` / `call-summary` / `proposal-draft` (generation). Every generated artifact cites the context it came from; every skill is scored against a golden eval set before it ships.

The product *ships agent configuration*, so the repo runs two lifecycles at once: application code (verified by tests/typecheck/build) and agent config — skill definitions, prompts, context schema, this file, hooks (verified by `evals/`). A 4-point eval pass-rate drop is a regression exactly like a red test.

## Load-bearing invariants

These come from the spec and are not negotiable without a T2 change (intent → spec → plan):

1. **The opportunity is the primary key, and its ID is CRM-shaped** (`crm_system` + `crm_id` in frontmatter), even in synthetic data. No migration later.
2. **Everything is a file with typed frontmatter; git is the store.** No database in v1.
3. **Two mutability classes.** *Canonical* context (`context/org/**`, `context/legal/**`, `context/demand-gen/**`) is replaced and versioned through review. *Accumulating* context (`context/accounts/**`) is **append-only** — meeting notes are never rewritten; superseded artifacts are marked, not deleted.
4. **Provenance is mandatory.** No material claim in a generation artifact without a resolvable citation; anything unsourced is marked `[unsourced]`, not asserted.
5. **Outcomes are first-class.** Every generated artifact gets an outcome record in `outcomes.jsonl`. Unfilled outcomes are a tracked metric.
6. **Context grants are declared per skill and enforced at the loader, not by prompt.** `call-prep` cannot read `context/legal/**`; review skills have **no write grant at all** — they return structured findings, a separate step persists them.
7. **`inbound/**` is untrusted.** Counterparty-supplied documents are quarantined, read-only, and wrapped in untrusted-content delimiters. A hook blocks any tool call whose arguments originate from `inbound/**` content. See spec §9.
8. **No real third-party data in the repo, ever.** CI fails on any account slug outside the synthetic corpus namespace. Every corpus file carries a `FICTIONAL` marker.

## Skill / eval / schema changes are always Tier 2

Per the framework §3: any change to the **context schema**, a **skill contract**, or an **eval gate** requires the full artifact chain — `docs/intent/NNN-slug.md` → `docs/specs/NNN-slug.md` → `docs/plans/NNN-slug.md`, all committed before code. Everything else tiers down:

- **T0** (dep bump, typo, formatting, flake): direct PR, CI green, self-merge. No artifacts.
- **T1** (an eval case, a UI screen, a bug fix): `plan.md` only. Issue → plan mode → PR → review → merge.
- **T2** (new skill, schema change, architectural decision): full chain.

Start T1/T2 implementation in **plan mode**. Commit the approved plan as `docs/plans/NNN-slug.md` before writing code. Open an intent via the `.github/ISSUE_TEMPLATE/intent-template.md` issue template.

## Eval gates (once `evals/` exists)

A PR touching `.claude/skills/**`, `packages/skills/**`, `context/schema/**`, or `CLAUDE.md` must pass:

- Citation validity = **1.00** (every citation resolves and supports its claim)
- Blocker recall = **1.00** on review skills — the one non-negotiable gate
- Retrieval recall ≥ **0.90** on required spans
- Generation rubric ≥ **4.0/5**
- **No net regression** vs. the last committed result in `evals/results/`

**Every production defect becomes a permanent eval case** — the fix PR must include the case that would have caught it.

## Planned architecture (spec §6)

Claude Code is the dev environment, the Claude Agent SDK is the runtime, MCP is the interface between the agent core and everything else.

```
Surfaces:  Claude Code / desktop (via MCP)  ·  thin Next.js surface (via Agent SDK)
              │
packages/mcp-deal-desk   MCP server — tools: context.read · context.search ·
                         artifact.write · skill.run · trace.get.
                         Enforces context grants, emits traces.
              │
packages/context-core    loader, schema validation, scope resolution, provenance,
                         append-only enforcement, outcome records
packages/skills           skill definitions as DATA (one file drives the Claude Code
                          skill, the MCP tool, and the eval runner)
evals/                    golden set + runner + scorers
apps/surface/             thin Next.js surface: context editor, trace viewer, eval board
```

The skill definition is data, not prose — see spec §5.3 for the shape. Scope resolution is *computable* from the `context/` tree nesting, not semantic; semantic retrieval is a ranking layer inside a scope, never the scope itself.

## Planned context layout (spec §4.2)

```
context/
├─ schema/                          # JSON Schema for every frontmatter type — the published spec
├─ org/
│  ├─ company.md                    # who we are, mission, positioning
│  ├─ offerings/<offering>.md       # what we sell, scope boundaries
│  ├─ pricing.md                    # rate card, discount authority, floors
│  └─ evidence/<case-study>.md      # case studies, references, proof points
├─ demand-gen/
│  ├─ icp/account.md, icp/buyer.md
│  ├─ campaigns/<campaign>.md
│  └─ events/<event>.md
├─ legal/
│  ├─ guidance.md                   # positions, red lines, fallback ladder
│  ├─ templates/msa.md, templates/sow.md
│  └─ clause-library/<clause>.md    # preferred / acceptable / unacceptable, with rationale
└─ accounts/
   └─ <account-slug>/
      ├─ account.md                 # firmographics, structure, history
      ├─ people/<person>.md         # role, disposition, quotes
      ├─ research/<note>.md
      └─ opportunities/
         └─ <crm-opportunity-id>/
            ├─ opportunity.md       # stage, amount, dates, competitive context
            ├─ meetings/<date>-<type>.md        # append-only
            ├─ artifacts/<id>-<kind>.md         # generated: brief, summary, proposal, findings
            ├─ inbound/<date>-<doc>.md          # counterparty-supplied — UNTRUSTED (see §9)
            └─ outcomes.jsonl                   # append-only outcome records
```

## Planned commands (spec §5.4 — not present yet)

Once the monorepo is scaffolded, verification loops run: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm eval --suite <skill>`. Update this section with the real commands (including how to run a single test) when `package.json` lands.

## Directories that exist now

- `docs/AgenticSalesHub_Spec_v2.md`, `docs/AgenticSalesHub_AISDLCFramework_v1.md` — the two source-of-truth docs
- `docs/intent/`, `docs/specs/`, `docs/plans/` — the artifact chain (empty, `.gitkeep` only)
- `evals/results/` — eval run outputs, committed so history lives in git (empty)
- `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` — empty scaffolding for product + dev skills, subagents, and enforcement hooks
- `.github/ISSUE_TEMPLATE/intent-template.md` — the Plan-stage issue template

## Working notes

- This file is read on every run — keep it under ~150 lines. Anything longer becomes a skill.
- Every repeated correction goes here. Every irreversible decision gets an ADR in `docs/decisions/`.
- Advisory guidance goes in skills; enforcement goes in hooks. If something *must not* happen (write to `context/legal/**`, edit the golden eval set, merge to main), it needs a hook, not a paragraph.
- Solo project: the written spec is what stops Thursday-you from rubber-stamping Monday-you. Approve intents and specs in a session separate from the one that wrote them.
