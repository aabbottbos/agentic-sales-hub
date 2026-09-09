# Agentic Sales Hub

An AI-native sales desk for a single seller — the layer between "we have a
meeting" and "we have signed paper." One context substrate per opportunity;
skills that read it; every artifact they produce cites the context it came from,
and every skill is scored against a golden set before it ships.

> **Phase 0 is built.** The context substrate, the two foundational skills
> (`find-evidence`, `sow-review`), and the eval harness all work end-to-end. See
> `docs/plans/001-context-substrate-eval-harness.md`.

## Quickstart

```bash
corepack enable
pnpm install
pnpm typecheck && pnpm test && pnpm build
pnpm eval --suite all
```

`pnpm eval --suite all` runs both skills against the synthetic corpus and prints
the gate table. Expected: `sow-review` blocker recall 1.00, precision 1.00,
citation validity 1.00, injection blocked; `find-evidence` recall 1.00.

## What's here

| Path | What |
|---|---|
| `context/schema/` | 17 JSON Schemas — the published context spec (`context/schema/README.md`) |
| `context/` | the "Minimal + 1 opportunity" synthetic corpus (Meridian Grid / Acme Logistics). All fictional — see `CORPUS.md` |
| `packages/context-core` | the context loader and security boundary |
| `packages/skills` | `find-evidence` + `sow-review` — deterministic in Phase 0 (`docs/decisions/0001-phase0-deterministic-skills.md`) |
| `evals/` | scorers, labeled cases, the runner, the injection harness; results in `evals/results/` |
| `.claude/hooks/` | quarantine-inbound, protect-paths, format-on-write |
| `docs/` | the spec, the SDLC framework, and the `intent/` → `specs/` → `plans/` artifact chain |

## How it's built

Under an AI-native SDLC (`docs/AgenticSalesHub_AISDLCFramework_v1.md`): every
capability goes intent → spec → plan → PR, and the eval suite gates every change
to a skill, the schema, or a gate. `REVIEW.md` is the review policy.

## Commands

See `CLAUDE.md` § Commands. The essentials: `pnpm test` (add a path for one
file), `pnpm eval --suite <sow-review|find-evidence|all>`, `pnpm corpus:validate`,
`pnpm check:no-real-data`.

## License

Not yet licensed. A license decision (MIT on the context spec and, later, the MCP
server) is a Phase 3 concern.
