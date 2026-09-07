# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Phase 0 is built** (plan `docs/plans/001-context-substrate-eval-harness.md`). What exists and works:

- `packages/context-core` — the context loader and security boundary (schema validation, scope resolution, provenance, append-only enforcement, quarantine + taint ledger, `writeFindings`).
- `packages/skills` — `find-evidence` (retrieval) and `sow-review` (review) as **deterministic** impls (ADR `docs/decisions/0001-phase0-deterministic-skills.md`), driven by YAML definitions; `runSkill` enforces grants + output contract.
- `context/` — the "Minimal + 1 opportunity" synthetic corpus (Meridian Grid / Acme Logistics) + `context/schema/` (17 JSON Schemas, the published spec).
- `evals/` — scorers, labeled cases, `pnpm eval --suite <…>`, and the injection harness. All six Phase 0 success criteria pass.
- `.claude/hooks/` — quarantine + protect-paths (PreToolUse), format-on-write (PostToolUse); `.claude/settings.json` registers them.
- `.github/workflows/` — `ci.yml`, `evals.yml`, `claude.yml`, `claude-review.yml`.

Not yet built (Phase 1+): `packages/mcp-deal-desk`, `apps/surface/`, the generation skills (`call-prep` / `call-summary` / `proposal-draft`), `context/legal/templates/`, most of the spec §10 corpus.

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
7. **`inbound/**` is untrusted.** Counterparty-supplied documents are quarantined, read-only, and wrapped in untrusted-content delimiters. `context-core.readInbound` is the **only** sanctioned inbound access path — it verifies `source_hash`, wraps the body, and registers taint. The quarantine hook blocks any tool call whose arguments match the taint ledger. See spec §9.
8. **No real third-party data in the repo, ever.** `pnpm check:no-real-data` fails on any account slug outside the synthetic namespace (`meridian-` / `acme-` / `northwind-` / `globex-` / `initech-`) or any context file missing `fictional: true`.

## context-core is the security boundary

- `readInbound(path)` is the only way to read an `inbound/**` file. It returns wrapped text, never raw. `.claude/settings.json` denies `Read` on `inbound/**` so nothing bypasses it.
- `writeFindings(...)` and `appendOutcome(...)` are the only write paths into `context/accounts/**`. Review skills have no write grant; the eval runner calls `writeFindings` separately.
- Scope is **computed** from a skill's grant globs against the real tree (`resolveScope`) — never semantic. `search()` only ranks within a scope it is handed; it cannot widen it.

## Skill / eval / schema changes are always Tier 2

Per the framework §3: any change to the **context schema**, a **skill contract**, or an **eval gate** requires the full artifact chain — `docs/intent/NNN-slug.md` → `docs/specs/NNN-slug.md` → `docs/plans/NNN-slug.md`, all committed before code. Everything else tiers down:

- **T0** (dep bump, typo, formatting, flake): direct PR, CI green, self-merge. No artifacts.
- **T1** (an eval case, a UI screen, a bug fix): `plan.md` only. Issue → plan mode → PR → review → merge.
- **T2** (new skill, schema change, architectural decision): full chain.

Start T1/T2 implementation in **plan mode**. Commit the approved plan as `docs/plans/NNN-slug.md` before writing code. Open an intent via the `.github/ISSUE_TEMPLATE/intent-template.md` issue template.

## Eval gates

A PR touching `.claude/skills/**`, `packages/skills/**`, `packages/context-core/**`, `context/**`, `evals/**`, or `CLAUDE.md` runs `evals.yml` and must pass:

- `sow-review` blocker recall = **1.00** — the one non-negotiable gate
- `sow-review` precision ≥ **0.70**; citation validity = **1.00**
- The injection case: the quarantine hook blocks the induced write (`injection: PASS`)
- `find-evidence` recall ≥ **0.90** on required spans; citation validity = **1.00**
- Generation rubric ≥ **4.0/5** (Phase 1, once a generation skill exists)
- **No net regression** vs. the last committed result in `evals/results/`

**Every production defect becomes a permanent eval case** — the fix PR must include the case that would have caught it.

## Commands

| | |
|---|---|
| `pnpm typecheck` | `tsc -b` across all packages |
| `pnpm test` | all vitest projects |
| `pnpm vitest run <file>` | a single test file |
| `pnpm vitest --project <name>` | one package (`context-core` / `skills` / `evals`) |
| `pnpm build` | build the packages |
| `pnpm lint` | eslint + prettier --check |
| `pnpm format` | prettier --write |
| `pnpm eval --suite <sow-review\|find-evidence\|all>` | run the eval suite; `--write-results` (auto in CI) writes `evals/results/<date>-<sha>.json` |
| `pnpm corpus:validate` | validate every `context/` file, inbound hashes, dir-name cross-checks |
| `pnpm check:no-real-data` | synthetic-namespace + `fictional: true` guard |
| `pnpm skills:sync` / `:check` | regenerate / drift-check `.claude/skills/<id>/SKILL.md` from the YAML definitions |

Node 22 (`.nvmrc`); local dev on 24+ is allowed. `pnpm` via corepack.

## Architecture

Claude Code is the dev environment, the Claude Agent SDK is the runtime (Phase 1+), MCP is the interface between the agent core and everything else (Phase 1+).

```
packages/context-core    loader + security boundary: schema validation, scope
                         resolution, provenance, append-only, quarantine/taint,
                         writeFindings, appendOutcome, validateCorpus
packages/skills           YAML skill definitions (data — one file drives the
                          Claude Code skill, the future MCP tool, the eval runner)
                          + deterministic impls + runSkill
evals/                    scorers · labeled cases · runner · injection-harness
context/schema/           17 JSON Schemas — the published context spec
context/                  the synthetic corpus
.claude/hooks/            quarantine-inbound, protect-paths, format-on-write
--- Phase 1+ ---
packages/mcp-deal-desk    MCP server (context.read/search, artifact.write, skill.run, trace.get)
apps/surface/             thin Next.js surface: context editor, trace viewer, eval board
```

The skill definition is data, not prose — see `packages/skills/src/skill-def.schema.json`. Scope resolution is *computable* from the `context/` tree nesting, not semantic.

## Deterministic skills in Phase 0

`find-evidence` and `sow-review` are rule-based, not LLM-backed — see ADR `docs/decisions/0001-phase0-deterministic-skills.md`. Blocker recall = 1.00 is a property of code. Phase 1 swaps an Agent-SDK-backed impl into `packages/skills/src/impl/` behind the same contract; no schema/harness change.

## Context layout

`context/schema/README.md` is the full path→schema table. In brief: `context/org/**` (company, offerings, pricing, evidence) and `context/legal/**` (guidance, clause-library) and `context/demand-gen/icp/**` are **canonical**; `context/accounts/<slug>/` (account, people, `opportunities/<crm-id>/` with opportunity, meetings, artifacts, inbound, `outcomes.jsonl`) is **accumulating** / append-only. `inbound/**` is untrusted (§7).

## Working notes

- This file is read on every run — keep it under ~150 lines. Anything longer becomes a skill.
- Every repeated correction goes here. Every irreversible decision gets an ADR in `docs/decisions/`.
- Advisory guidance goes in skills; enforcement goes in hooks. If something *must not* happen (write to `context/legal/**`, edit the golden eval set, merge to main), it needs a hook, not a paragraph.
- Solo project: the written spec is what stops Thursday-you from rubber-stamping Monday-you. Approve intents and specs in a session separate from the one that wrote them.
