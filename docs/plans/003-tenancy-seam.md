# 003 — tenancy seam (WI-1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

## Context

Intent 003 and spec 003 (`docs/specs/003-tenancy-seam.md`) are committed on
`spec/003-tenancy-seam`. Its 8 judgement calls have been reviewed and accepted
(session note: this session both wrote and reviewed the spec — CLAUDE.md wants
approval in a separate session; flag for a fresh-session pass before treating
that as the load-bearing sign-off). This plan implements WI-1 exactly as
spec'd: make the context root configurable (`resolveContextRoot()` +
`AshConfig`), decouple it from schema/ledger resolution, move the demo corpus
from `context/` to `examples/demo-corpus/`, and add the guards
(`check:context-empty`, dual-root hook/deny coverage) that keep the transition
safe. This is the dependency root for WI-4 (MCP server) — nothing downstream
can assume a hardcoded `context/` root after this lands.

Two things the spec's explicit "functions to touch" list omits, found during
exploration, are in scope here because leaving them out reintroduces the exact
bug this WI exists to fix:

- `findings/write-findings.ts` and `outcomes/append-outcome.ts` build a
  logical `context/accounts/...` string internally and `join(repoRoot, ...)`
  it directly — untouched, they'd keep writing into the now-empty `context/`
  tree instead of the configured root, which WI-2 would silently inherit.
- `evals/runner/run-suite.ts` has one more direct `readFile(join(REPO_ROOT,
  c.input.meeting_path))` (the rubric judge's raw note-text read) with the
  same bug.

## Design (within the 8 ratified judgement calls — not re-litigated here)

**One shared helper**, new file `packages/context-core/src/fs/resolve-path.ts`:

```ts
export function resolveContextPath(logicalPath: string, root: string): string
// strips a leading "context/" segment, joins the remainder onto `root`.
// Absolute input passes through unchanged. Throws if a relative path
// doesn't start with "context/" (defensive backstop — assertInsideContext
// in scope/resolve.ts is the primary well-formedness check for grants).

export function toLogicalContextPath(absOrRel: string, root: string): string
// inverse: physical path under root -> logical "context/..." string.
```

Every function that currently does `join(repoRoot, "context/...")` switches to
`resolveContextPath(logicalPath, root)`. The parameter these functions call
`repoRoot` today is renamed to `root` where it's actually being used as the
corpus root (it always was — the rename corrects a pre-existing misnomer, not
a new concept): `resolveScope`, `walkContext`, `resolveCitation`,
`verifyCitation`, `readContextFile`/`toRepoRelative`, `validateCorpus`'s two
direct-read sites, `writeFindings`, `appendOutcome`. Functions that are
genuinely repo-relative (schema dir, taint ledger path) keep `repoRoot`
unchanged. No function takes both.

**`createLoader()`** gains `root?: string` in `LoaderOptions`. Internally:
`const root = resolveContextRoot({ root: opts.root, cwd: repoRoot })` —
called unconditionally, every time. No separate "was root explicitly passed"
check is needed: `resolveContextRoot`'s own precedence chain already treats
`opts.root === undefined` as "not explicitly passed" and falls through to
env → config → default on its own. `repoRoot` stays required and continues
to govern `schemaDir` (`<repoRoot>/context/schema`, unmoved) and
`taintLedgerPath`.

**`walkContext`** switches from `ignore: ["context/schema/**"]` glob-exclusion
to explicitly enumerating the four corpus subdirs (`org`, `demand-gen`,
`legal`, `accounts`) against the physical `root`, prefixing `context/` onto
each match to keep returning logical strings. This removes the ambiguity
flagged in resolved OQ7 (an adopter root with its own `schema/` would
otherwise get walked incorrectly).

**`ash.config.json`** (new, repo root): `{"contextRoot": "./context"}`. This
is the adopter-facing default — it correctly points at the now-mostly-empty
`./context`, not at `examples/demo-corpus`. The demo/eval tooling reaches
`examples/demo-corpus` entirely through the higher-precedence `--root` /
`ASH_CONTEXT_ROOT` mechanism at each script's own call site, which is
computed as `explicitRoot ?? process.env.ASH_CONTEXT_ROOT ?? "examples/demo-corpus"`
and passed in as `opts.root` — top-of-chain, so it wins without ever
consulting `ash.config.json`. This is the one subtle point worth restating:
`ash.config.json`'s `contextRoot` is never meant to say "demo corpus lives
here" — that would break a real adopter's config the moment they populate
`context/` themselves.

**`git mv` end state** — resolving the spec's "four demo subdirs become
`.gitkeep`-only" precisely: this means `context/` ends up containing *only*
`schema/`, `templates/`, and a top-level `.gitkeep` — not four empty stub
directories named `org/`/`demand-gen/`/`legal/`/`accounts/`. Keeping empty
stub dirs would reintroduce exactly the ambiguity OQ7 was resolved to remove,
and `check:context-empty`'s allowlist (`{schema, templates, .gitkeep}`)
doesn't list them as permitted top-level entries — a stray `org/`
reappearing at the top level is exactly the failure mode the check exists to
catch.

**`evals/golden/corpus.lock.json` keys stay `context/...`** (not renamed to
`examples/demo-corpus/...`). `walkContext` returns logical paths by design;
the lock file follows the same convention every other artifact (grants,
citations, eval cases) uses. Verification is: same keys, byte-identical hash
values, before vs. after the move.

## Files touched

**New:**
- `packages/context-core/src/config.ts` — `resolveContextRoot()`, `AshConfig`.
  Sync (not async) — called at the top of `createLoader()` before other async
  work, and needs to match the exact signature `resolveContextRoot(opts?: {
  root?: string })` that WI-4's MCP server will call unchanged (spec OQ8).
  Accepts an additional optional `cwd` for test isolation (doesn't touch the
  WI-4-relevant shape). Missing or malformed `ash.config.json` falls through
  silently to the next precedence rung — this is a resolution function, not a
  validator.
- `packages/context-core/src/config.test.ts` — precedence-chain tests (each
  link proven by having the *other* three sources present-but-losing, not
  merely absent), absolute-path assertion, missing/malformed config handling.
- `packages/context-core/src/fs/resolve-path.ts` — `resolveContextPath` /
  `toLogicalContextPath`, tested standalone against both a `context`-named
  and a non-`context`-named fixture root before anything wires into it.
- `packages/context-core/src/fs/resolve-path.test.ts`
- `packages/context-core/src/loader.test.ts` — does not exist yet (confirmed).
  New empty-tree test: a temp root with only `schema/` copied in and no
  corpus subdirs; `createLoader({ repoRoot, root: tmpRoot })`, assert
  `list()` → `[]`, `readScope(...)` → `[]`, neither throws. Directly asserts
  the intent's named acceptance criterion.
- `packages/context-core/src/fs/walk.test.ts` — does not exist yet (confirmed).
- `packages/context-core/src/check-context-empty.ts` + `.test.ts` — pure
  function `checkContextEmpty(contextDir): { ok, offenders }`, mirroring
  `validate-corpus.ts`'s src/vs/scripts split so the pass/fail logic is
  testable without spawning a subprocess. Shallow `readdir` (one level) of
  `context/` against the allowlist `{schema, templates, .gitkeep}` — this
  checks the top-level directory listing of `context/` itself, not the
  contents of `schema/`/`templates/`, and not "are subdirs gitkeep-only"
  (there are no other subdirs left in the target end-state).
- `packages/context-core/scripts/check-context-empty.ts` — thin CLI wrapper
  (shebang, calls the pure function, `process.exit`), same pattern as
  `scripts/validate-corpus.ts`.
- `packages/context-core/test/fixtures/demo-corpus/` — a second, small
  fixture tree with **no `context/` wrapper** (e.g. just
  `org/company.md`, `legal/guidance.md`) specifically so the
  logical-prefix-rewrite tests can't pass by coincidence (the existing
  `test/fixtures/context/` tree is itself named `context/`, which wouldn't
  actually exercise the rewrite).
- `ash.config.json` (repo root) — `{"contextRoot": "./context"}`.
- `context/templates/.gitkeep`, `context/templates/README.md` (one line,
  points at `context/schema/`), `context/.gitkeep`.

**Modified (resolution logic, one commit — see Sequencing):**
- `packages/context-core/src/loader.ts` — `LoaderOptions.root?: string`,
  `resolveContextRoot()` call, closure threads `root` to the functions that
  need it (listed above) and keeps `repoRoot` for schema/ledger.
- `packages/context-core/src/fs/walk.ts` — explicit four-subdir enumeration.
- `packages/context-core/src/scope/resolve.ts` — `resolveScope(..., root)`
  globs against the physical root via the helper; `assertInsideContext`
  (the `pattern.startsWith("context/")` guard) is unchanged — it's the
  well-formedness check on the logical prefix and runs before any disk
  access, exactly as today.
- `packages/context-core/src/provenance/resolve-citation.ts`,
  `verify-citation.ts` — `root` param, `resolveContextPath`.
- `packages/context-core/src/fs/read.ts` — `toRepoRelative`/`readContextFile`
  take `root`; `classify()` still receives the logical string unchanged
  (its regexes are anchored `^context/...` and never touch disk).
- `packages/context-core/src/validate-corpus.ts` — its two direct-read sites
  (dir-name cross-check, `outcomes.jsonl` parsing) switch from
  `readFile(join(repoRoot, rel))` to `readFile(resolveContextPath(rel, root))`.
- `packages/context-core/src/findings/write-findings.ts`,
  `src/outcomes/append-outcome.ts` — `WriteFindingsDeps`/`AppendOutcomeDeps`
  field renamed `repoRoot` → `root`; raw `join(root, relPath)` replaced with
  `resolveContextPath(relPath, root)`. `hashSourceDocument` in
  write-findings.ts gets the same treatment for `args.sourceDocument`.
- `packages/context-core/src/findings/write-findings.test.ts` — add a case
  with `root` pointing at a non-`context`-named temp dir, asserting the
  artifact actually lands under `<tmpRoot>/accounts/...`, not
  `<tmpRoot>/context/accounts/...`.
- `packages/context-core/src/outcomes/append-outcome.test.ts` — new file
  (none exists today); same non-`context`-root coverage.
- `packages/context-core/src/index.ts` — export `resolveContextRoot`,
  `AshConfig` (new "Config" section, before "Schema"); export
  `resolveContextPath`, `toLogicalContextPath` under "Filesystem" (needed
  publicly — `no-real-data.ts`, `lock-corpus.ts`, `run-suite.ts` outside the
  package use them for their own direct-read sites).

**Scripts (threaded after the resolution-logic commit, before the move):**
- `packages/context-core/scripts/validate-corpus.ts` — add `--root` flag
  parsing (keep the positional arg as a fallback — nothing in-repo calls it
  positionally today, but it's a free safety net). Root resolution:
  `resolveContextRoot({ root: explicitRoot ?? process.env.ASH_CONTEXT_ROOT ??
  "examples/demo-corpus", cwd: repoRoot })` — this idiom (script-level demo
  default passed in as the `opts.root` candidate, ahead of calling
  `resolveContextRoot`) is what makes "default to the demo fixture, but let
  `--root`/`ASH_CONTEXT_ROOT` override it, without ever falling through to
  `ash.config.json`" work correctly. Reuse this exact idiom in every script
  below.
- `evals/runner/checks/no-real-data.ts` — currently has its own
  repo-root-finding walk-up loop (keep it, still needed for `cwd` and
  `evals/golden/allowed-slugs.txt`, which stays repo-relative). Add the same
  `--root`/`ASH_CONTEXT_ROOT`-with-demo-default idiom; switch
  `join(root, "context/accounts")` → `join(root, "accounts")`; switch its two
  direct `readFile(join(root, rel))` sites to
  `readFile(resolveContextPath(rel, root))`.
- `evals/runner/lock-corpus.ts` — same idiom for root resolution; `walkContext(root)`
  already returns logical paths; hash each via
  `readFile(resolveContextPath(rel, root))`; lock file keys stay `context/...`
  unchanged (see Design above).
- `evals/runner/run-suite.ts` — `REPO_ROOT` unchanged (repo-relative
  artifacts). `makeLoader()`'s `root` computed once via the same idiom
  (`ASH_CONTEXT_ROOT ?? join(REPO_ROOT, "examples/demo-corpus")`), reused
  (not recomputed) for the rubric-judge direct read fix:
  `readFile(resolveContextPath(c.input.meeting_path, contextRoot))` in place
  of the current `readFile(join(REPO_ROOT, c.input.meeting_path))`.
- `evals/runner/cli.ts` — no change; it never touches `context/` paths
  itself, `ASH_CONTEXT_ROOT` flows to `run-suite.ts` via `process.env`
  automatically.
- `evals/runner/injection-harness.ts` — no change (confirmed already
  root-agnostic: `ASH_TAINT_LEDGER` is repo-root-relative and explicit).
- `packages/skills/src/hooks.test.ts` — check whether it depends on real
  demo-corpus content through a bare `createLoader({ repoRoot })` (which
  would now resolve to the empty `./context` default); if so, add
  `root: join(repoRoot, "examples/demo-corpus")` in the same commit as the
  script threading, not deferred.

**Hooks / settings (additive, both roots retained — judgement call #4):**
- `.claude/hooks/protect-paths.ts` — add `/^examples\/demo-corpus\/legal\//`
  to `PROTECTED_WRITE`; extend `APPEND_ONLY` to match both
  `context/accounts/.../opportunities/` and
  `examples/demo-corpus/accounts/.../opportunities/` (single combined regex
  with alternation, or two regexes checked with `.some` — either is fine,
  not a judgement call); add the matching literal-string checks in the Bash
  destructive-command branch. No change to `protect-paths.sh` (unchanged
  wrapper).
- `.claude/settings.json` — add `Read(./examples/demo-corpus/accounts/**/inbound/**)`,
  `Write(./examples/demo-corpus/legal/**)`, `Edit(./examples/demo-corpus/legal/**)`
  alongside the existing `./context/**` entries.

**CI / package.json:**
- `package.json` — new script `"check:context-empty": "tsx packages/context-core/scripts/check-context-empty.ts"`.
- `.github/workflows/ci.yml` — new required step after "No real data":
  `pnpm check:context-empty`. Blocking, no `continue-on-error` (judgement call #7).

**Docs:**
- `context/schema/README.md` — path→schema table stays as-is (still
  correctly describes the *logical* layout). Update only the
  "corpus:validate walks every file under `context/`" prose to name the
  configured root / demo default.
- `CORPUS.md` — this file describes the *physical* fictional fixture, so its
  `context/` references become `examples/demo-corpus/`.
- `CLAUDE.md` — targeted edits only: the two lines that make a *physical*
  filesystem claim (the "Current state" bullet naming `context/` as where
  the synthetic corpus lives; the `context/` line in the architecture ASCII
  block) become `examples/demo-corpus/`. Lines describing the *logical*
  contract (mutability classes, skill grants, `context/accounts/<slug>/`
  layout in "Context layout") are left alone — they're accurately describing
  a logical prefix that is unchanged by this WI.
- `README.md` — add a short note that `ASH_CONTEXT_ROOT` / `ash.config.json`
  lets an adopter point tooling at their own corpus (spec's stated
  requirement; exact insertion point found during implementation).

## Sequencing (single PR, ordered commits — do not split across PRs)

1. `config.ts` + tests — standalone, no downstream dependents yet.
2. `fs/resolve-path.ts` + tests — standalone, tested directly against both
   fixture roots before anything wires into it.
3. **Resolution-logic commit** — `loader.ts`, `scope/resolve.ts`, `fs/walk.ts`,
   `provenance/{resolve-citation,verify-citation}.ts`, `fs/read.ts`,
   `validate-corpus.ts`, `findings/write-findings.ts`,
   `outcomes/append-outcome.ts`, `index.ts` exports, plus all their test
   updates — one commit (they're mutually coupled through `loader.ts`'s
   closure; the package won't build split across commits).
   **Checkpoint: do NOT touch `context/` or any script yet.** With no `root`
   passed anywhere, everything still resolves to `./context` (unchanged
   default) and the real corpus is still physically there — so
   `pnpm typecheck && pnpm test && pnpm corpus:validate && pnpm check:no-real-data
   && pnpm eval --suite all` must all stay green here, proving the refactor
   is behavior-preserving *before* the move happens. This isolates "did the
   resolution logic break something" from "did the move break something" —
   debug here first if anything goes red.
4. **`git mv` commit** — the move + `context/templates/` scaffold + top-level
   `context/.gitkeep`, mechanical, no code changes. Expected to leave
   `corpus:validate`/`check:no-real-data`/`pnpm eval` red locally until step 5
   — call this out explicitly in the PR description so a reviewer bisecting
   commits knows the intermediate state is expected, not a regression. Never
   merge with 4 landed and 5 pending.

   Exact `git mv` sequence (one subdir per invocation, for clean
   `git log --follow` attribution):
   ```bash
   mkdir -p examples/demo-corpus
   git mv context/org examples/demo-corpus/org
   git mv context/demand-gen examples/demo-corpus/demand-gen
   git mv context/legal examples/demo-corpus/legal
   git mv context/accounts examples/demo-corpus/accounts
   rm -f context/.DS_Store   # stray, untracked — not part of the corpus
   mkdir -p context/templates && touch context/templates/.gitkeep
   # + context/templates/README.md (one line, points at context/schema/)
   touch context/.gitkeep
   git add -A
   ```
5. **Script-threading commit** — `validate-corpus.ts`, `no-real-data.ts`,
   `lock-corpus.ts`, `run-suite.ts` (+ `hooks.test.ts` root override if
   needed). Restores green immediately after step 4.
6. **Hooks/settings commit** — `protect-paths.ts`, `settings.json`. Lands
   after step 5 so the newly-protected physical paths actually exist on disk
   for any test that exercises the hook against real repo content.
7. **`check:context-empty` commit** — script + test + `package.json` +
   `ci.yml` wiring.
8. **`ash.config.json`** — can land any time after step 1; bundling with
   step 1 is fine.
9. **Docs commit** — after the move and script threading, so referenced
   paths/commands are accurate.
10. **`pnpm eval:lock` regeneration** — after steps 4 and 5. Diff old vs new
    `corpus.lock.json`: same keys, byte-identical hashes. A mismatch means
    the move corrupted something — investigate before merging, per the
    spec's explicit gate.
11. **Final verification commit** — full acceptance run (below), commit the
    resulting `evals/results/<date>-<sha>.json` showing
    `regression_verdict: PASS`.

## Verification

Run after step 11, in order:

1. `ASH_CONTEXT_ROOT=examples/demo-corpus pnpm eval --suite all` → green;
   deterministic values (`sow-review` blocker_recall/precision/citation_validity/
   injection; `find-evidence` recall/citation_validity) **identical** to the
   latest committed `evals/results/*.json`; `call-summary` citation_validity = 1.00.
2. `pnpm eval --suite all` (no env var) → same result — proves the default
   now correctly targets `examples/demo-corpus`.
3. `pnpm corpus:validate --root examples/demo-corpus` → 0 errors.
4. `pnpm corpus:validate` (no flag) → 0 errors, same target by default.
5. `pnpm check:no-real-data` → OK against `examples/demo-corpus/accounts/**`.
6. `pnpm check:context-empty` → passes on the real repo state.
7. `pnpm eval:lock` → regenerated lock: same keys, byte-identical hashes vs.
   the pre-move committed version.
8. `grep -rn "context/accounts\|context/org\|context/legal\|context/demand-gen"
   packages/ evals/ scripts/` → every remaining hit is a logical-path literal
   passed through `resolveContextPath` (or a comment/grant-glob string), never
   the second argument to a raw `join(root, ...)` outside that helper.
9. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → green.
10. `pnpm skills:sync:check` → no drift (confirms judgement call #1 — no
    skill YAML touched).
11. `git log --follow examples/demo-corpus/legal/guidance.md` → shows
    pre-move history.
12. Manual: `context/` contains only `schema/`, `templates/`, `.gitkeep`;
    `templates/` contains only `.gitkeep` + `README.md`.
13. CI green end-to-end on the PR, including the new `check:context-empty`
    step.
14. Fresh `evals/results/<date>-<sha>.json` committed, `regression_verdict: PASS`.
</content>
