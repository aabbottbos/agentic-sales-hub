# 003 — Tenancy seam

**Tier:** tier:2
**Status:** draft
**Intent:** docs/intent/003-tenancy-seam.md

## Summary

Make the context root configurable and move the synthetic corpus out of
`context/`. A new `packages/context-core/src/config.ts` exports
`resolveContextRoot()` (precedence `opts.root` → `ASH_CONTEXT_ROOT` →
`ash.config.json` `contextRoot` → `./context`, resolved to an absolute path) and
an `AshConfig` type. `createLoader()` gains an optional `{ root }`; when omitted
it calls `resolveContextRoot()`. **No other module reads the root directly.** The
demo corpus (`org/`, `demand-gen/`, `legal/`, `accounts/`) `git mv`s from
`context/` to `examples/demo-corpus/`; `context/schema/` stays; `context/templates/`
is created (empty, `.gitkeep` + one-line README); the four demo subdirs under
`context/` become `.gitkeep`-only. `ash.config.json` at the repo root carries
`contextRoot: "./context"`. The eval harness, `pnpm corpus:validate`, and
`pnpm check:no-real-data` default their root to `examples/demo-corpus` and accept
a `--root` / `ASH_CONTEXT_ROOT` override. A new `pnpm check:context-empty` (wired
into `ci.yml`) fails if anything but `schema/`, `templates/`, `.gitkeep` appears
under `context/`. An empty `context/` with no override is a valid state:
`createLoader()` returns an empty tree and does not throw. No eval score changes.

## Context model impact

- **Schema changes:** **None.** `context/schema/**` (the published JSON Schemas)
  does not move and is not edited. `context/schema/README.md` prose is updated (the
  path→schema table now describes a *logical* `context/`-rooted layout that
  resolves against the configured root).
- **Mutability class of touched context:** unchanged. The corpus files keep their
  frontmatter (`mutability: canonical | accumulating`, `fictional: true`)
  verbatim — the move is a `git mv`, not an edit. `examples/demo-corpus/legal/**`
  is still canonical; `examples/demo-corpus/accounts/**` is still append-only.
  The append-only enforcement (`fs/append-only.ts`) and the protect-paths hook
  gain the new physical root alongside the old one.
- **Provenance / citations:** unchanged. Citations are `{path, span}` where `path`
  is a `context/...`-rooted logical string; `resolveCitation` resolves it against
  the configured root the same way `resolveScope` does (see "The logical prefix"
  below). Every existing eval-case citation string (`context/legal/...`,
  `context/org/...`) keeps working unedited.

## Skill contract

The intent adds no skill. It does, however, decide **how a skill's declared
`context_grants.read` globs resolve** once the corpus is not at `context/`. This
is a contract-adjacent decision, resolved here so the plan does not re-open it:

**The logical prefix.** Grant globs, eval-case `path`s, and citation `path`s stay
exactly as written today — `context/accounts/*/opportunities/*/meetings/**`,
`context/legal/guidance.md`, etc. `context/` is a **logical root marker**. At
resolution time (`resolveScope`, `walkContext`, `resolveCitation`,
`readContextFile`, `validateCorpus`) the loader strips the leading `context/`
segment and joins the remainder to the configured absolute root. So a grant
`context/legal/**` with root `examples/demo-corpus` globs
`examples/demo-corpus/legal/**`; with root `./context` (an adopter's real tree)
it globs `context/legal/**`.

Consequences:

- **No skill YAML changes.** `find-evidence.yaml`, `sow-review.yaml`,
  `call-summary.yaml` grant globs are untouched. `skills:sync:check` stays green
  with no regeneration.
- **No eval-case path changes.** Every `context/...` string in `evals/cases/**`
  and `evals/cases/**/expected/**` is untouched.
- `resolveScope`'s existing guard `pattern.startsWith("context/")` **stays** — it
  is now a well-formedness check on the *logical* prefix, and it is the one place
  that enforces "a grant must be `context/`-rooted."
- The alternative — rewrite every grant glob and case path to be root-relative
  (`accounts/*/...`) and make `cwd` the context root — is rejected: it churns the
  skill contracts and every case file for no behavioural gain, and it breaks the
  intent's "no skill-contract changes" line. Flagged as **Judgment call #1**.

## Context grants

No new grants. The existing three skills' read scopes are unchanged strings; only
their *physical* resolution target moves with the root. Least-privilege is
preserved — a grant still cannot widen its scope, and `resolveScope` still refuses
a non-`context/` prefix.

## Security considerations

- **`inbound/**` quarantine.** The corpus move relocates
  `context/accounts/*/opportunities/*/inbound/**` to
  `examples/demo-corpus/accounts/.../inbound/**`. Every inbound control must
  follow:
  - `.claude/settings.json` `deny` list: `Read(./context/accounts/**/inbound/**)`
    → the spec requires **both** `./context/**` **and**
    `./examples/demo-corpus/**` inbound patterns in the deny list. Rationale: a
    stray `inbound/` file planted under `context/` before `check:context-empty`
    runs must still be unreadable. Belt-and-braces; the cost is two extra deny
    lines. **Judgment call #4.**
  - `context-core.readInbound()` is still the only sanctioned inbound path; it
    resolves `path` against the configured root and wraps + taints the same way.
    No signature change.
  - The quarantine hook (`.claude/hooks/quarantine-inbound.ts`) reads the taint
    ledger by an env/relative path and matches arg text against ingested
    shingles — root-agnostic. No change beyond confirming the eval
    injection-harness still points the hook at the right ledger (it sets
    `ASH_TAINT_LEDGER` explicitly; unaffected by the corpus move).
  - The injection eval case (`sow-review` `sow-redline`, `injection: PASS`) must
    still block the induced write. Its `document_path` is a `context/...` logical
    string resolved against `examples/demo-corpus` — no case edit.
- **`.claude/hooks/protect-paths.ts`.** `PROTECTED_WRITE` regexes
  (`/^context\/legal\//`, `/^evals\/golden\//`) and `APPEND_ONLY`
  (`/context\/accounts\/[^/]+\/opportunities\//`) match the *logical*
  `context/...` prefix. The spec requires adding
  `/^examples\/demo-corpus\/legal\//` and
  `/examples\/demo-corpus\/accounts\/[^/]+\/opportunities\//` (and the Bash-arg
  string checks) so a direct edit of the *physical* demo tree is also blocked.
  The intent's blast-radius line "add `examples/demo-corpus/legal/**` alongside
  `context/legal/**`" is satisfied here.
- **`check:no-real-data`.** Now walks `examples/demo-corpus/accounts/**` (via the
  configured root). The synthetic-namespace guard (`meridian-` / `acme-` /
  `northwind-` / `globex-` / `initech-`) and the `fictional: true` requirement
  are unchanged. An adopter's real `context/accounts/**` is **not** scanned by
  this check by default (it targets the demo root) — that is correct: the check
  exists to keep the *repo's committed fixture* synthetic, not to police an
  adopter's private data. Noted as a non-goal below.
- **New attack surface:** `ash.config.json` is a new file the loader reads.
  `resolveContextRoot()` must treat `contextRoot` as a path, resolve it to
  absolute, and **not** follow it outside the repo without the caller having
  asked (`opts.root` / `ASH_CONTEXT_ROOT` are explicit opt-in; a malicious
  `ash.config.json` pointing at `/etc` is a self-inflicted wound in a
  single-tenant repo, but the spec still requires the resolved root to be logged
  in the loader's trace/first-read for auditability). No path-traversal guard
  beyond that — this is one repo per org, not a sandbox.

## Non-goals / out of scope

- **Multi-tenancy.** One repo per organization. The configurable root separates
  demo data from real data and lets evals target a fixture — nothing more.
  Stated in the README (amendment §7).
- **Consuming `org.slug` or `compile.skillOverridesMaxChars`.** These fields are
  *typed* in `AshConfig` (so the shape is stable and WI-5 does not have to touch
  the interface) but nothing reads them. WI-5 owns the knob machinery.
- **Filling `context/templates/`.** WI-1 creates the directory with a `.gitkeep`
  and a one-line README pointing at `context/schema/`. The per-schema commented
  starter files are WI-5 (amendment §5.2 / §4).
- **Policing an adopter's real corpus.** `check:no-real-data` targets the demo
  root; it does not scan an adopter's `context/accounts/**`. Out of scope by
  design.
- **`pnpm init:context`.** Scaffolding a fresh empty tree + `ash.config.json` for
  an adopter is WI-5 (amendment §9 item 5). WI-1 only ensures the empty state
  *works*.
- **`intake/` drop zone / `routeIntake()`.** Amendment §4 shows `intake/` in the
  end-state layout; it is WI-5. Not created here.

**Reverses a standing non-goal?** **No.** "Multi-tenant SaaS" stays a non-goal —
this is explicitly *not* that (one repo per org). Everything else in the
standing non-goal list is untouched.

## Eval impact

- **Suites that must still pass, unchanged:** `sow-review`, `find-evidence`,
  `call-summary`. The corpus move must not alter a deterministic score.
- **The "no behavior change" baseline (resolves intent OQ2).** The amendment §7
  names `evals/results/2026-09-07-434b594.json`, which predates the `call-summary`
  suite. The spec pins the comparison as:
  - **`sow-review`** — `blocker_recall`, `precision`, `citation_validity`,
    `injection` **exactly equal** to the latest committed `evals/results/*.json`
    at merge time.
  - **`find-evidence`** — `recall`, `citation_validity` **exactly equal**;
    `precision_at_k` exactly equal (it is deterministic).
  - **`call-summary`** — `citation_validity` = **1.00**. `rubric_aggregate` and
    `commitment_recall` are advisory (spec 002 amendment A1), hit a live model,
    and are **not compared** — a WI that only moves files cannot be blamed for
    judge drift.
  - The comparison is done by re-pointing `pnpm eval --suite all` at the moved
    corpus (`ASH_CONTEXT_ROOT=examples/demo-corpus`) and diffing against the
    committed result. A changed deterministic value is a merge blocker.
- **New eval / test cases required (schema-or-gate change ⇒ at least one):**
  1. **`config.ts` unit tests** (`packages/context-core/src/config.test.ts`) —
     `resolveContextRoot()` precedence: `opts.root` wins over `ASH_CONTEXT_ROOT`
     wins over `ash.config.json` wins over `./context`; result is absolute;
     missing `ash.config.json` is not an error (falls through to `./context`).
  2. **Empty-tree test** (`packages/context-core/src/loader.test.ts` or
     `validate-corpus.test.ts`) — `createLoader()` against a root whose tree has
     only `schema/` + `.gitkeep`s returns a loader whose `list()` is `[]` and
     `readScope(...)` is `[]`; **does not throw**. Directly asserts intent
     criterion.
  3. **`check:context-empty` test** — a script test (or a case under
     `evals/runner/checks/`) that the guard **passes** on a tree with only
     `schema/` / `templates/` / `.gitkeep`, and **fails** (non-zero exit) when a
     file is planted under `context/org/`. Both directions.
  4. **`resolveScope` / `walkContext` against a non-`context/` physical root** —
     a `context-core` test that a grant glob `context/legal/**` resolves to files
     under a temp root `.../demo-corpus/legal/**` (the logical-prefix mechanism).
- **Gates this must clear:**
  - **No net regression** vs. the last committed `evals/results/` — the load-bearing
    gate for this WI.
  - `sow-review` blocker recall = **1.00**; `find-evidence` recall ≥ **0.90**;
    `call-summary` citation validity = **1.00**; injection `PASS` — all as today,
    now measured against the moved corpus.
  - `pnpm corpus:validate --root examples/demo-corpus` → **0 errors** on the full
    file set; the no-`--root` invocation defaults to the same.
  - `pnpm check:no-real-data` → OK against `examples/demo-corpus/accounts/**`.
  - `pnpm check:context-empty` → passes clean, fails on a planted file.
  - `pnpm eval:lock` regenerated; `evals/golden/corpus.lock.json` paths rooted at
    `examples/demo-corpus`. The lock's content hashes must be **byte-identical**
    to today's (the files did not change, only their location) — a mismatch means
    the `git mv` corrupted something.
- **`evals/results/` entry:** a fresh committed result from the CI run on the PR,
  showing `regression_verdict: PASS` against the prior baseline.

## Judgment calls for review

Start here.

1. **The logical `context/` prefix (load-bearing).** Grant globs, eval-case
   paths, and citation paths stay `context/...`; the loader rewrites the prefix
   to the configured physical root at resolution time. The alternative
   (root-relative grants + `cwd = contextRoot`) is rejected because it churns
   every skill YAML and case file and breaks the intent's "no skill-contract
   changes" line. **Flag if you want root-relative grants instead** — that is a
   bigger change and arguably its own contract revision.

2. **`AshConfig` ships fully typed (resolves intent OQ3).** `contextRoot` +
   optional `org.slug` + optional `compile.skillOverridesMaxChars` are all in the
   `config.ts` interface now, per amendment §5.1, even though only `contextRoot`
   is read. Keeps WI-5 off the interface. Flag if you want `contextRoot`-only and
   a WI-5 interface bump.

3. **`createLoader()` keeps `repoRoot`; `{ root }` is added alongside.** The
   current signature is `createLoader({ repoRoot, schemaDir?, now?, taintLedgerPath? })`.
   The spec adds an optional `root` (the context root). When `root` is given it
   is the corpus location and `schemaDir` defaults to `<repoRoot>/context/schema`
   still (schema does **not** move). When `root` is omitted, `resolveContextRoot()`
   supplies it. `repoRoot` stays required (the ledger, hooks, and
   `evals/golden/` are repo-relative, not context-relative). The amendment's
   shorthand "`createLoader({ root })`" is read as "add `root`," not "replace
   `repoRoot`." Flag if you expected `repoRoot` to go away.

4. **`.claude/settings.json` + `protect-paths.ts` list BOTH roots.** Deny rules
   and protect regexes cover `./context/**` *and* `./examples/demo-corpus/**` for
   inbound-read and legal/append-only-write. Rationale: a file planted under
   `context/` before `check:context-empty` catches it must still be protected.
   Cost: a few extra literal lines. Flag if you want demo-corpus-only (relying on
   `check:context-empty` as the sole guard for the `context/` tree).

5. **`check:no-real-data` targets the demo root only, by default.** It does not
   scan an adopter's real `context/accounts/**`. The check keeps the *committed
   fixture* synthetic; policing private adopter data is out of scope. Flag if you
   want it to also run (and pass vacuously) against `./context` when that tree is
   non-empty.

6. **`context/templates/` ships now** (intent OQ1, resolved yes): empty dir,
   `.gitkeep`, one-line `README.md`. `check:context-empty`'s allowlist is
   `{schema, templates, .gitkeep}` from day one so WI-5 does not have to touch
   the guard. Flag if you want `templates/` deferred and the allowlist to be
   `{schema, .gitkeep}` until WI-5.

7. **`ci.yml` gains `check:context-empty` as a required check.** It runs on every
   PR (cheap, filesystem-only). The intent's blast radius says "`ci.yml` — Add
   `check:context-empty`"; the spec makes it blocking, consistent with the other
   `check:*` scripts. Flag if you want it advisory-only initially.

8. **`git mv` mechanics are the plan's call.** The spec requires: history is
   preserved (`git mv`, or `git mv` + follow-up path edits in the same commit),
   and the moved files are **byte-identical** to their `context/` originals
   (verified by the `corpus.lock.json` hashes being unchanged). The plan picks
   the exact sequence.

## Open questions

Carried from `intent.md`, with resolutions:

1. **`context/templates/` in this WI** — *resolved* (Judgment #6): yes, empty +
   `.gitkeep` + README.
2. **"No behavior change" baseline** — *resolved* (Eval impact): deterministic
   suites exact-equal vs. latest committed result; `call-summary`
   `citation_validity` = 1.00; advisory metrics not compared.
3. **`AshConfig` type surface** — *resolved* (Judgment #2): fully typed now, only
   `contextRoot` consumed.
4. **`.claude/settings.json` deny-rule roots** — *resolved* (Judgment #4): both
   roots.
5. **`git mv` mechanics** — *deferred to the plan* (Judgment #8): spec requires
   history preservation + byte-identical files; plan picks the sequence.

New, surfaced by this spec:

6. **`schemaDir` when `root` is set.** `context/schema/` does not move, so with
   `root = examples/demo-corpus` the loader still needs `<repoRoot>/context/schema`.
   The spec's Judgment #3 says `schemaDir` keeps defaulting to
   `<repoRoot>/context/schema`. Confirm this is right — i.e. schema is
   *repo-relative*, corpus is *root-relative*, and they are decoupled. An adopter
   with their own root still uses the repo's published schemas (that is the
   point — the schema *is* the spec).

7. **`walkContext` ignore of `schema/`.** `walkContext` currently
   `ignore: ["context/schema/**"]`. With the logical-prefix rewrite, does it
   ignore `<root>/schema/**` (physical) — which for an adopter root would ignore
   *their* `schema/` if they have one — or does it only ever look at
   corpus subdirs (`org`, `demand-gen`, `legal`, `accounts`)? The plan pins the
   glob; the spec's position is that `walkContext` enumerates the four corpus
   subdirs explicitly rather than "everything except schema", removing the
   ambiguity.

8. **`.mcp.json` (WI-4 forward-check).** Amendment §8 says the future MCP server
   reads the root via `resolveContextRoot()` and "a fresh `.mcp.json` pointing at
   an arbitrary `contextRoot` works with no code change." Nothing in WI-1 creates
   `.mcp.json`, but the spec should confirm `resolveContextRoot()`'s signature is
   the one WI-4 will call unchanged. It is: `resolveContextRoot(opts?: { root?: string })`.
