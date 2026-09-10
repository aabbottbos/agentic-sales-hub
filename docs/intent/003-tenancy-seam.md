# 003 — Tenancy seam

**Tier:** tier:2
**Status:** draft
**Issue:** #15

## Problem

The context corpus (`context/accounts/**`, `context/org/**`, `context/legal/**`,
`context/demand-gen/**`) is the synthetic Meridian Grid / Acme Logistics fixture,
and every module that reads it — `createLoader()`, `corpus:validate`,
`check:no-real-data`, the eval runner, `lock-corpus.ts`, the `.claude` hooks and
settings — assumes the corpus lives at the hardcoded path `context/`. An outside
organization that clones the repo to populate its own context has to first delete
the demo data out of the directory it is meant to fill, and then edit code paths
in `context-core` and the eval harness to point anywhere else. The Adoptability
Amendment (D-A3, §5.1, §7) makes "an outside org clones, populates its own
context, and gets useful output without rework" a co-equal objective; the
hardcoded root blocks it. It also blocks WI-4 — the MCP server would bake the same
hardcoded path in.

## Proposed outcome

`context/` ships empty (only `schema/`, `templates/`, and `.gitkeep`s). The demo
corpus lives at `examples/demo-corpus/`. The context root is resolved once, in
`packages/context-core/src/config.ts`, by `resolveContextRoot()` with the
precedence `opts.root` → `ASH_CONTEXT_ROOT` → `ash.config.json` `contextRoot` →
`./context`; `createLoader({ root })` is the only caller, and no other module
reads the root directly. `ash.config.json` at the repo root carries
`contextRoot: "./context"`. A fresh clone with an empty `context/` and no env var
or config produces an empty tree from `createLoader()` and does not throw. The
eval harness, `corpus:validate`, and `check:no-real-data` all target
`examples/demo-corpus/` by default but accept a `--root` / `ASH_CONTEXT_ROOT`
override, so an adopter can point the same suite at their own golden set. A new
`check:context-empty` guard (in `ci.yml`) fails if anything but
`schema/`/`templates/`/`.gitkeep` appears under `context/`.

## Who it affects

- **`packages/context-core`** — new `config.ts`; `loader.ts` `createLoader({ root })`;
  `validate-corpus.ts` root parameter.
- **`evals/`** — `run-suite.ts` and `injection-harness.ts` (loader root),
  `lock-corpus.ts` (root parameter), `evals/golden/corpus.lock.json` (regenerate),
  `evals/cases/**` (fixture paths that reference `context/accounts/...`).
- **Scripts** — `corpus:validate` (`--root`, default `examples/demo-corpus`),
  `check:no-real-data` (targets `examples/demo-corpus/accounts/**`), new
  `check:context-empty`.
- **`.claude/`** — `settings.json` `Read` deny on `inbound/**` and `Write`/`Edit`
  deny on `legal/**` must match both roots; `hooks/protect-paths.ts` adds
  `examples/demo-corpus/legal/**` alongside `context/legal/**`;
  `hooks/quarantine-inbound` taint path if it is root-relative.
- **Docs** — `context/schema/README.md` path→schema table, `CORPUS.md` location
  references, `CLAUDE.md` context-layout section, `README.md` (adopter can point
  the eval suite at their own corpus — the "second payoff").
- **CI** — `ci.yml` gains `check:context-empty`.
- **No product-facing skill contract changes.** `find-evidence`, `sow-review`,
  `call-summary` grant globs are still `context/...`-relative strings resolved
  against whatever root the loader was handed; their YAML is untouched.

## Constraints

- **Tier:2** — adds a CI gate (`check:context-empty`), repoints two existing
  gates (`corpus:validate`, `check:no-real-data`), and changes the
  `createLoader()` contract. Full intent → spec → plan chain, committed before
  code.
- **No behavior change.** The corpus move must not alter any eval score. The exact
  comparison baseline is an open question (below).
- **`resolveContextRoot()` is the single reader of the root.** No other module may
  read `ASH_CONTEXT_ROOT` or `ash.config.json` directly (amendment §5.1).
- **An empty `context/` is a valid state, not an error** — an acceptance
  criterion, not a nicety (amendment §5.1).
- **Scope fence.** This is not multi-tenancy. One repo per organization. The
  configurable root separates demo data from real data and lets evals target a
  fixture — nothing more. `org.slug` and `compile.skillOverridesMaxChars` may be
  *typed* in `AshConfig` but are not *consumed* until WI-5.
- **WI-1 must land before WI-4** (amendment §2) or the MCP server bakes in a
  hardcoded root.
- Node 22 pin, `pnpm` via corepack, existing lint/format rules unchanged.

## Open questions

1. **Does `context/templates/` ship in this WI?** Resolved at intent stage: **yes**
   — WI-1 creates `context/templates/` with a `.gitkeep` and a one-line README;
   `check:context-empty` allowlists `schema/`, `templates/`, `.gitkeep`. WI-5
   fills `templates/` with the knob schemas. (Recorded here so the spec does not
   re-open it.)
2. **Which eval baseline does "no behavior change" compare against?** The
   amendment (§7) names `evals/results/2026-09-07-434b594.json`, which predates
   the `call-summary` suite and the current baseline
   (`evals/results/2026-09-10-0932036.json`). The spec must pin the exact
   comparison — likely: `sow-review` and `find-evidence` metrics exact-equal
   against the latest committed result; `call-summary` `citation_validity = 1.00`
   holds; advisory `rubric_aggregate` / `commitment_recall` are not compared
   (they hit a live model and drift regardless).
3. **`ash.config.json` schema surface.** Ship the full `AshConfig` interface
   (`contextRoot`, optional `org.slug`, optional `compile.skillOverridesMaxChars`)
   as a type now, or only `contextRoot` and grow the rest in WI-5? The spec
   decides; the amendment §5.1 lists all three.
4. **`.claude/settings.json` deny rules.** These are literal path strings, not
   globs with variable roots. After the move, do they list *both* `./context/**`
   and `./examples/demo-corpus/**` (belt-and-braces, since `context/` should be
   empty anyway), or only the demo-corpus paths? The spec pins it against the
   security posture (a stray `inbound/` file under `context/` must never be
   readable even though `check:context-empty` should have caught it).
5. **`git mv` vs. copy-then-delete for the corpus tree.** `git mv` preserves
   history but the blast-radius path edits will still show as a large diff. The
   plan decides the mechanics; the spec need only require history preservation.

## How we'll know it worked

- `ASH_CONTEXT_ROOT=examples/demo-corpus pnpm eval --suite all` is green, and the
  deterministic gate values (`sow-review` blocker_recall / precision /
  citation_validity / injection; `find-evidence` recall / citation_validity)
  are **identical** to the latest committed `evals/results/*.json`;
  `call-summary` `citation_validity` = **1.00**. A changed deterministic score is
  a blocker — find out why before merging.
- `pnpm corpus:validate --root examples/demo-corpus` → all corpus files, **0
  errors**; and the same command with no `--root` also targets
  `examples/demo-corpus` by default.
- `pnpm check:no-real-data` passes against `examples/demo-corpus/accounts/**`.
- `pnpm check:context-empty` **passes** on a clean tree and **fails** when a file
  is planted under `context/org/` (a test proves both directions).
- With no `ASH_CONTEXT_ROOT` and no `ash.config.json` override,
  `createLoader()` against an empty `context/` returns an empty tree and **does
  not throw** — a `context-core` unit test asserts this.
- `pnpm eval:lock` regenerated; `evals/golden/corpus.lock.json` paths are rooted
  at `examples/demo-corpus`.
- `grep -rn "context/accounts\|context/org\|context/legal\|context/demand-gen"
  packages/ evals/ scripts/` returns **only** matches inside grant-glob strings
  and comments — no module constructs a filesystem path from a hardcoded
  `context/` root.
- `pnpm typecheck / lint / test / build` green; `pnpm skills:sync:check` no
  drift.
- README documents that an adopter can point `pnpm eval` at their own corpus via
  `ASH_CONTEXT_ROOT` (the "second payoff").
