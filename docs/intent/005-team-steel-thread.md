# 005 — Team steel thread: identity, concurrent writes, background trigger

**Tier:** tier:2
**Status:** draft
**Issue:** #22

## Problem

Agentic Sales Hub assumes a single seller on a single machine. Nothing in
the write path carries actor identity — `WriteArtifactArgs`,
`AppendOutcomeArgs`, and the `artifact.json` / `outcome.json` schemas have
no field for "who did this." Concurrent writers are not safe: `writeArtifact`
mints collision-free artifact ids via `flag: "wx"`, but `appendOutcome`'s
`appendFile` has no equivalent guard, and neither function does anything at
the git layer (no commit, no lock, no conflict detection) — two processes
writing to the same opportunity at once can interleave or lose data. Every
skill invocation today is synchronous and human-initiated through Claude
Code; there is no event surface, so a skill cannot run without a person
prompting it.

Team use (faster onboarding via shared context, teammates/managers
supporting each other's deals, trend analysis across a pipeline, CS/Product
reading sales context) and the concrete background-agent case ("run sales
coaching automatically after every discovery-call transcript is saved")
both require identity, safe concurrent writes, and an event surface. None
of the three exist today, and none can be retrofitted onto individual
skills later without first proving the underlying server/identity/
concurrency layer works.

## Proposed outcome

A running MCP server (`packages/mcp-agentic-sales-hub`) fronts the context
store. Every write carries actor identity. Concurrent writes against the
same opportunity are serialized safely (single-process mutex/queue — not
distributed, multi-machine git locking, which is explicitly deferred). A
file landing under an opportunity's `inbound/**` triggers `call-summary`
automatically, with no human invoking it, attributed to a fixed system
sentinel actor. The thread is proven end-to-end using two already-built,
already-eval-gated skills (`call-summary`, `call-prep`) — no new skill is
authored as part of this work. Team features beyond this thread (RBAC,
cross-org grants, trend-analysis rollups, CS/Product read surfaces, a real
third-party trigger source like Gong/Zoom) are explicitly out of scope and
deferred to later work items.

## Who it affects

- `packages/context-core` — schema changes (`artifact.json`,
  `outcome.json` gain an actor field), `WriteArtifactArgs` /
  `AppendOutcomeArgs` type changes, `writeArtifact()` / `appendOutcome()`
  gain the serialization layer.
- `packages/mcp-agentic-sales-hub` — new package; one MCP tool wrapping
  `runSkill()` for `call-summary`, a second for `call-prep`, plus the
  in-process file watcher.
- `call-summary` and `call-prep` skills — exercised through the new server
  path; no contract change to either skill itself.
- `evals/` — one new case covering the watcher-triggered path.

No other skills, no `apps/surface/`, no UI work.

## Constraints

- File watcher only as the trigger source — no third-party integration
  (Gong, Zoom, Otter, webhooks) in this thread.
- Concurrency solved via a single-process mutex/queue inside the one MCP
  server instance, not distributed or multi-machine git locking.
- Machine-triggered runs use a fixed sentinel actor (e.g.
  `system:file-watcher`), not resolved human identity.
- The watcher runs inside the MCP server process, not as a separate
  process/client.
- No skill chaining in this thread — proving one automatic trigger
  (`call-summary`) is sufficient; `call-summary → call-prep` chaining is
  explicitly not required.
- Must not weaken any existing eval gate (citation validity 1.00, blocker
  recall 1.00, no net regression) — CLAUDE.md's non-negotiable rule applies
  to this work like any other.

## Open questions

1. Exact shape of the actor field — a bare string sentinel vs. a typed
   `{ type: "human" | "system", id: string }` shape. Affects both schemas
   and every call site.
2. Does this work item replace WI-4 (`packages/mcp-agentic-sales-hub` +
   §10 corpus expansion) outright, or does corpus expansion stay a
   separate, later work item once this thread lands?
3. Where does this land relative to WI-3 (`proposal-draft`) — ahead of it,
   or in parallel? (Leaning ahead of, since `proposal-draft` doesn't
   depend on any of this, but the North Star's "priority order" argues for
   proving the team-support spine before adding a third generation skill
   to a still-single-seller architecture.)
4. Does `appendOutcome`'s missing write-guard (no `flag: "wx"` equivalent,
   discovered during this intent's own investigation) get fixed as part of
   the mutex/serialization task, or is it a separate, smaller fix that
   should land first on its own?

## How we'll know it worked

- A concurrency test firing N simultaneous `writeArtifact` /
  `appendOutcome` calls against the same opportunity produces N
  sequential, uncorrupted results — no lost writes, no interleaved
  `outcomes.jsonl` lines.
- Dropping a transcript-shaped file into a scratch corpus's `inbound/**`
  causes `call-summary` to run within the watcher's debounce window with
  no human action, and the resulting artifact/outcome record carries the
  fixed sentinel actor.
- All existing eval gates (citation validity 1.00, blocker recall 1.00, no
  net regression vs. the last committed result) still pass when the same
  skills run through the new MCP server path.
- A new eval case exercises the watcher-triggered path and is committed to
  `evals/cases/`, per CLAUDE.md's "every production defect / every change
  becomes a permanent eval case" norm.
