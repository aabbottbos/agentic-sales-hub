# 005 — Team steel thread: identity, concurrent writes, background trigger

**Tier:** tier:2
**Status:** draft
**Intent:** docs/intent/005-team-steel-thread.md

## Summary

Stand up `packages/mcp-agentic-sales-hub`, a long-running MCP server that fronts
the context store. Every write through it carries actor identity
(`{ type: "human" | "system", id: string }`). Concurrent writes against the
same opportunity are serialized by a single-process mutex/queue keyed on
`accountSlug + crmId`, closing the gap where `appendOutcome`'s `appendFile`
has no collision guard equivalent to `writeFindings`'s `flag: "wx"`. An
in-process file watcher observes `inbound/**`; a new file landing there
triggers `call-summary` automatically, attributed to a fixed sentinel actor
(`{ type: "system", id: "file-watcher" }`), with no human invoking it. The
thread is proven through the two MCP tools the spec adds — one wrapping
`call-summary`, one wrapping `call-prep` — with no new skill authored and no
contract change to either skill's definition YAML.

**This spec surfaces one hard blocker before any of the above can be built:
`call-prep` and `writeArtifact()` do not exist.** See Judgment call #1 — the
plan cannot proceed against intent 005 as scoped until this is resolved with
the user, and doing so is out of this spec's authority.

## Context model impact

- **Schema changes:**
  - `context/schema/artifact.json` gains a required `actor` field:
    `{ type: object, properties: { type: { enum: ["human", "system"] }, id: { type: string, minLength: 1 } }, required: [type, id], additionalProperties: false }`.
  - `context/schema/outcome.json` gains the same required `actor` field (it is
    `additionalProperties: false` today and is **not** a frontmatter-composing
    schema, so `actor` is added directly to its own `properties`/`required`,
    not via `frontmatter-common.json`).
  - `frontmatter-common.json`'s `commonFields` is **not** touched — `actor`
    is specific to write-path records (artifact, outcome), not every context
    file's frontmatter. A `meeting.md` or `person.md` file still has no actor
    field; only records this spec's write path produces or amends get one.
  - Both changes are additive + required-with-no-default, which is a MINOR
    schema_version bump under the existing rule ("same MAJOR, MINOR ≤
    current" — README, `schema_version`). New required field is a policy
    call, logged as **Judgment call #2**: an alternative is `actor` optional
    with an "unknown" default for pre-existing corpus rows, avoiding any
    migration. This spec requires it (see JC #2 for why) and accepts the
    corpus-migration cost that follows.
- **Mutability class:** unchanged. `artifact.json` stays `mutability: accumulating`;
  `outcome.json` stays governed by the append-only rule on `outcomes.jsonl`.
  Adding `actor` does not change what may be rewritten — nothing existing is
  rewritten; only new records carry it going forward (see JC #2 on backfill).
- **Provenance/citation requirements:** unchanged. `actor` records *who
  ran the skill*, not a source citation — it does not participate in
  `citations[]`/`resolveCitation` and is orthogonal to citation validity.

## Skill contract

No skill is added or its contract changed, per the intent's explicit
constraint. `call-summary.yaml` and (once it exists — see JC #1) a
`call-prep.yaml` are consumed unmodified. What *is* new is the layer above
`runSkill`:

- **`packages/mcp-agentic-sales-hub`** exposes two MCP tools,
  `skill.call-summary` and `skill.call-prep`, each taking the skill's
  existing `inputs` plus one new field the tool layer requires but the skill
  definition does not: `actor: { type: "human" | "system", id: string }`.
  This is deliberately **not** added to `skill-def.schema.json`'s `inputs` —
  actor is a property of *who invoked the tool*, not a skill input the skill
  itself consumes or that `validateInput` should type-check per-skill. It is
  threaded by the MCP tool handler directly into the write-path call
  (`writeArtifact`/`appendOutcome`) that follows `runSkill`, not into
  `runSkill`'s `input` argument.
- **`runSkill` itself is unmodified.** It still returns a result with no
  persistence; a separate step (already true today for `sow-review` →
  `writeFindings`) is the one that calls `writeArtifact`/`appendOutcome`,
  and that separate step is the new MCP tool handler.

## Context grants

- **Read scope:** the MCP server's tool handlers call `runSkill`, which
  already enforces each skill's declared `context_grants.read` at the
  loader (CLAUDE.md invariant 6). No new read grant — the server is a
  transport, not a new privilege.
- **Write scope:** the server process is the sole writer for the two tools it
  exposes, via `writeArtifact` (call-prep/call-summary output;
  `context/accounts/*/opportunities/*/artifacts/**`) and `appendOutcome`
  (`context/accounts/*/opportunities/*/outcomes.jsonl`), matching each
  skill's generation-tier write path once WI-2 lands (see JC #1). The
  file-watcher trigger path writes to the same scope, under the sentinel
  actor — it gets no broader grant than a human-invoked call would.

## Security considerations

- **Touches `inbound/**`?** Yes — the file watcher's trigger source *is* a
  new file appearing under `context/accounts/*/opportunities/*/inbound/**`.
  This is the one place this spec adds new attack surface:
  - The watcher must call `context-core.readInbound()` — the sole sanctioned
    inbound access path — to read the dropped file, exactly as a
    human-invoked `call-summary` run would. It does **not** get a
    bypass; `readInbound`'s `source_hash` verification and untrusted-content
    wrapping apply identically to a watcher-triggered read.
  - The quarantine hook (`.claude/hooks/quarantine-inbound.ts`) is a
    `PreToolUse` Claude Code hook — it fires on tool calls Claude Code
    itself dispatches. The MCP server is a **separate long-running
    process**, not a Claude Code tool invocation, so this hook does not
    wrap its calls. This spec requires the equivalent taint-ledger check be
    enforced **inside** the MCP server's write path itself (the same
    ledger-match logic the hook uses, called directly before any write the
    watcher-triggered run produces) — otherwise the quarantine boundary has
    a gap the moment a skill runs outside Claude Code's process. Flagged as
    **Judgment call #3** — the intent does not mention this, and it is a
    security-load-bearing decision, not a style one.
  - The watcher only *observes* `inbound/**` for new files (triggers on file
    creation) — it does not read file bodies directly; the actual read goes
    through `readInbound()` inside the triggered `call-summary` run, keeping
    hashing/wrapping/taint-registration on the one sanctioned path.
- **New attack surface — the server process itself:** a long-running
  process with write access to the context store is new. In scope for this
  spec: the mutex/queue must not allow a write from one opportunity's queue
  to block or interleave with another's (queue keyed per `accountSlug +
  crmId`, not global) — a global lock would be a self-inflicted DoS surface
  disproportionate to what's being protected. Out of scope (per intent
  constraints): authenticating *who* can call the MCP server at all — the
  intent's identity work is about labeling writes with actor identity, not
  authenticating callers. This spec does not add caller auth. Flagged
  explicitly rather than assumed — see Non-goals.
- **Sentinel actor:** `{ type: "system", id: "file-watcher" }` is a fixed,
  hardcoded value, not derived from any inbound content — it cannot be
  spoofed by a counterparty document, since nothing in the watcher path
  reads inbound content before minting the actor value.

## Non-goals / out of scope

- **Caller authentication to the MCP server.** Actor identity is *recorded*
  on writes; the server does not verify that a caller claiming
  `{type: "human", id: "alice"}` is actually Alice. This is a gap the intent
  doesn't ask this thread to close (RBAC is explicitly deferred), but it
  means "identity" here is closer to *attribution* than *authorization*.
  Not a reversal of a standing non-goal (multi-tenant auth was already
  out of scope) — stated for visibility, since a reader could otherwise
  assume "identity" implies "authenticated."
- **Distributed/multi-machine git locking.** Per intent constraint — single
  in-process mutex only.
- **Third-party trigger sources** (Gong, Zoom, Otter, webhooks). File
  watcher only.
- **Skill chaining** (`call-summary` → `call-prep` automatically). Not
  required or built here.
- **RBAC, cross-org grants, trend-analysis rollups, CS/Product read
  surfaces, `apps/surface/` UI work.** Per intent, deferred.
- **Corpus expansion (§10) / WI-4 scope beyond the MCP server package
  itself.** This spec builds `packages/mcp-agentic-sales-hub` as intent 005
  requires but does not address whether that closes WI-4 outright — carried
  to Open questions per intent OQ2, this spec does not resolve it.
- **Reverses a standing non-goal?** No product-level standing non-goal
  (multi-tenant SaaS, bidirectional CRM sync, e-signature, etc.) is
  reversed. The caller-authentication gap above is a *new* limitation
  surfaced by this work, not a reversal of an existing one.

## Eval impact

- **Suite:** a new case under `evals/cases/` (per CLAUDE.md's "every change
  becomes a permanent eval case" and the intent's own "how we'll know it
  worked") exercising the watcher-triggered path: drop a transcript-shaped
  fixture into a scratch corpus's `inbound/**`, assert `call-summary` runs
  within the debounce window with no human action, and assert the resulting
  artifact + outcome record both carry
  `actor: {type: "system", id: "file-watcher"}`.
- **Existing suites must still pass unchanged through the new path:**
  `sow-review` (blocker recall 1.00, precision ≥ 0.70, citation validity
  1.00), `find-evidence` (recall ≥ 0.90, citation validity 1.00),
  `call-summary` (citation validity 1.00, hard gate; rubric/commitment
  recall advisory per spec 002 A1) — run once directly (today's path,
  unchanged) and once through an MCP tool call, per the intent's "How we'll
  know it worked" criterion. No suite covers `call-prep` yet — see JC #1.
- **New unit-level coverage (not eval-suite, but required by the intent's
  own success criteria):** a concurrency test firing N simultaneous
  `writeArtifact`/`appendOutcome` calls at one opportunity, asserting N
  sequential uncorrupted results with no lost writes and no interleaved
  `outcomes.jsonl` lines.
- **Gates:** citation validity = 1.00, blocker recall = 1.00, the injection
  case (`injection: PASS`) — including through the MCP path, which is the
  point of Judgment call #3 above — and no net regression vs. the last
  committed `evals/results/`.

## Judgment calls for review

1. **Sequencing blocker: `call-prep` and `writeArtifact()` do not exist.**
   Confirmed against the repo (no `call-prep.ts`/`.yaml`, no
   `write-artifact.ts` anywhere in `packages/`) and against git history
   (intent 004 has only its intent doc committed — no spec, no plan, no
   code, on `main` or any other branch). Intent 005 states the thread is
   proven "using two already-built, already-eval-gated skills (`call-summary`,
   `call-prep`)" and describes `WriteArtifactArgs` as an existing type to
   modify. Neither is true today. This spec cannot resolve the conflict
   itself — the intent's own open question 3 already flags the sequencing
   question against WI-3 but not against WI-4/002's dependency on WI-2
   (intent 004) landing first. **This needs a decision before plan mode:**
   either (a) intent 004 (writeArtifact/call-prep) ships first as its own
   T2 change and 005 is re-scoped to depend on it, or (b) 005's scope drops
   to `call-summary` only (the one skill that *is* built) and "prove the
   thread with two skills" is relaxed to one, with `call-prep` wired in
   later once WI-2 lands. Recommendation: (a) — the intent's own "who it
   affects" section already lists `WriteArtifactArgs`/`AppendOutcomeArgs`
   as pre-existing, which reads as though 004 was assumed shipped when 005
   was written. I did not pick for you; the plan stage should not start
   until this is answered.
2. **`actor` required, not optional, on `artifact.json`/`outcome.json`.**
   The intent's OQ1 asks about the field's *shape* (string vs. typed) and
   this spec resolves that (typed `{type, id}`, matching the sentinel
   example in the intent's own constraints and Proposed outcome). It does
   not ask whether the field is *required*. Made required here because an
   optional actor field defeats the intent's own stated goal ("every write
   carries actor identity") — an optional field a caller can omit isn't a
   guarantee. Cost: every existing `artifacts/*.md` and `outcomes.jsonl`
   line in `examples/demo-corpus/` predates this field and becomes
   schema-invalid under strict validation. This spec does not resolve
   whether that means (a) a one-time migration backfilling a sentinel
   `{type: "system", id: "legacy"}` actor onto existing corpus records, or
   (b) the loader accepting missing `actor` only on records whose
   `schema_version` predates the bump (a grandfather clause, mirroring how
   `schema_version` MINOR skew already works). Left as an **open question**
   below rather than decided here, since it's a corpus-migration cost
   question the user should see directly.
3. **Quarantine hook coverage gap for the MCP server process.** Detailed
   under Security considerations above. The intent doesn't mention this;
   it's surfaced here because the hook is a Claude-Code-process mechanism
   and the MCP server is not one, so the existing protection silently does
   not extend to the new process by default. This spec requires an
   in-process equivalent check rather than leaving the gap.
4. **Mutex/queue keying: per-opportunity, not global.** The intent says
   "single-process mutex/queue," not scoped to what key. A global lock
   would satisfy the literal constraint but would serialize unrelated
   opportunities' writes against each other for no correctness reason —
   this spec picks per-`(accountSlug, crmId)` keying as the minimum
   granularity that actually matches the stated failure mode ("two
   processes writing to the *same opportunity*").
5. **`actor` lives outside `skill-def.schema.json`'s `inputs`, threaded by
   the MCP tool handler directly.** Alternative considered: add `actor` as
   a universal required input every skill definition must declare. Rejected
   because the intent is explicit that skill contracts do not change
   ("no contract change to either skill itself") and because `runSkill`'s
   existing `validateInput` is skill-specific type-checking, not a place to
   thread cross-cutting request metadata — that distinction (skill input vs.
   invocation metadata) doesn't exist anywhere in the codebase yet and this
   spec is introducing it.

## Open questions

Carried from the intent, plus new ones this spec surfaces:

1. **(Blocking — see JC #1)** Does 005 wait on intent 004 shipping first,
   or does 005's scope shrink to `call-summary`-only for this thread?
2. **(New, from JC #2)** Backfill existing corpus `artifact`/`outcome`
   records with a legacy sentinel actor, or grandfather pre-bump
   `schema_version` records to not require `actor`?
3. Does this work item replace WI-4 (`packages/mcp-agentic-sales-hub` + §10
   corpus expansion) outright, or does corpus expansion stay a separate,
   later work item? (Intent OQ2 — unresolved here; this spec only commits
   to building the package, not to closing WI-4's full scope.)
4. Where does this land relative to WI-3 (`proposal-draft`)? (Intent OQ3 —
   unresolved; noted that JC #1's blocker makes this moot until resolved,
   since 005 itself may now be blocked on 004.)
5. Does `appendOutcome`'s missing write-guard get fixed as part of this
   spec's mutex/serialization work, or does it land first as its own
   smaller fix? (Intent OQ4.) This spec's position: the mutex/queue this
   spec adds *subsumes* the need for a `flag: "wx"`-equivalent on
   `appendOutcome` — once writes are serialized per-opportunity through the
   queue, the collision this OQ worries about can't occur, so a separate
   guard is redundant if the queue ships first. Flagged as a position, not
   a decision, since "does the queue actually close this" is exactly what
   the concurrency test (Eval impact) must prove before this OQ can be
   marked resolved.
