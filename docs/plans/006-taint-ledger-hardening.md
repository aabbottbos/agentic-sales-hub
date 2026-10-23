# Plan 006: Taint-ledger hardening (T1)

## Context

The taint ledger (`packages/context-core/src/quarantine/taint.ts`) is what stops text from an untrusted `inbound/**` document from being laundered into a tool call or a context write. Two callers depend on it:
- the Claude Code PreToolUse hook (`.claude/hooks/quarantine-inbound.ts`), which checks tool-call arguments and any Write/Edit content aimed at `context/**`;
- `assertNotTainted` (`packages/mcp-agentic-sales-hub/src/tools/shared.ts`), which runs before the MCP `call-summary` tool and the inbound watcher persist an artifact.

HANDOFF follow-up 12 (raised in plan 005 Task 9 review) identified two flaws in `match()`:

1. **False negatives.** A short phrase (3–7 words) lifted from an inbound doc is caught only when it is the *entire* value (rule 3). Embed the same phrase in a longer write and nothing matches: rule 1 needs ≥2 shared 8-word shingles and rule 2 needs a whole 8-word shingle. The hook almost always sees long values, so on the security-critical path this is the common case.
2. **False positives.** Rules 2 and 3 use character-substring `includes`, which ignores word boundaries, so "net 30" matches inside "net 300". Rule 3 also has no notion of distinctiveness, so a generic phrase like "the customer shall" blocks.

Now that the watcher processes `inbound/**` unattended, this is the first post-005 work item (agreed 2026-10-23).

**Decision (user, 2026-10-23): two strictness profiles.**
- **Strict** applies to the hook, which covers agent tool calls and writes into `context/**`. No legitimate summarization happens there.
- **Standard** applies to MCP/watcher artifact writes. Their summaries naturally echo short transcript phrases, so they get the false-positive fixes but not embedded short-lift detection.

The real fix for summary laundering is to record taint provenance on artifacts derived from inbound docs. That is a schema change (T2) and becomes a new follow-up.

Tier: **T1**. No schema, skill-contract, or eval-gate change. It adds one eval case. Plan doc: `docs/plans/006-taint-ledger-hardening.md`. This takes number 006, so `proposal-draft` becomes intent 007, and every later item in the HANDOFF chain shifts by one.

## Design

All changes live in `taint.ts`. The ledger file format is **unchanged**. Every k-word window of a body (k ≤ 8) is a contiguous sub-run of some stored 8-word shingle, so smaller n-grams can be derived at match time from `entry.shingles`. Old ledgers keep working.

**New `match(value, opts?)` signature.** It replaces the positional `threshold`, which no caller passes.
```ts
type TaintProfile = "strict" | "standard";
match(value: string, opts?: { profile?: TaintProfile; threshold?: number })
```
**The default profile is `strict` (fail-closed).** A new caller gets the strong check unless it explicitly opts down.

**Shared helpers to add in `taint.ts`:**
- `words(normalized)`: splits on spaces.
- `containsRun(hay: string[], needle: string[])`: a word-boundary sub-sequence test. It replaces both `includes` calls.
- `STOPWORDS`: a small hard-coded English set (articles, prepositions, auxiliaries, pronouns, "shall/will/may", and so on).
- `contentWordCount(ws)`: the number of non-stopword tokens.
- `bodyNgrams(entry, k)`: the deduplicated set of k-word windows across `entry.shingles`, cached per entry for the duration of one call.

**Rules, evaluated per ledger entry:**

| # | Rule | Profiles |
|---|---|---|
| 1 | ≥ `threshold` (2) shared distinct 8-word shingles | both (unchanged) |
| 2 | Some body 8-word shingle occurs as a **word run** in the value | both (word-boundary fix) |
| 3 | The whole value is 3–7 words, occurs as a **word run** inside a body shingle, and has ≥ 2 content words | both (word-boundary + distinctiveness fix) |
| 4 | Some k-word window of the value (k = `STRICT_RUN_WORDS` = 6) is in `bodyNgrams(entry, 6)` and has ≥ 3 content words | **strict only** (new) |

`matchedText` returns the hit run, as today. Constants are exported (as `DEFAULT_SHINGLE_THRESHOLD` already is) so tests can pin them. k = 6 with ≥ 3 content words is the starting point. Task 2 calibrates it and may move it to 5 or 7. The chosen values and the evidence for them go into the plan doc.

Edge case: a body shorter than 8 words produces one shorter "shingle", as today. Rules 2–4 operate on its words directly.

## Tasks

1. **Plan doc.** Commit this plan as `docs/plans/006-taint-ledger-hardening.md` on branch `fix/006-taint-ledger-hardening`, before any code.
2. **Calibration harness** (scratchpad script, not committed). Register every corpus inbound doc in a temp ledger. Then run the **strict** profile over every non-inbound corpus file (meetings, artifacts, org, ICP), split into paragraphs, and over CLAUDE.md and the spec docs. Target: 0 hits on legitimate text. Inspect each hit and tune k and the content-word minimum. Record the final numbers (paragraphs checked, hits per setting) in the plan doc.
3. **Implement the `taint.ts` changes** above. Thread `opts` through `ContextLoader.isTainted(value, opts?)`, both the interface and the implementation (`packages/context-core/src/loader.ts:65,132`). Export `TaintProfile` from the context-core index.
4. **Callers.**
   - `.claude/hooks/quarantine-inbound.ts:96,116`: pass `{ profile: "strict" }` explicitly, even though it's the default, so the hook's intent is readable.
   - `packages/mcp-agentic-sales-hub/src/tools/shared.ts` `assertNotTainted`: pass `{ profile: "standard" }`. Its doc comment explains why: summaries legitimately echo short phrases from their own source, and provenance taint is the planned real fix.
5. **Unit tests** (`packages/context-core/src/quarantine/quarantine.test.ts`), alongside the 4 existing tests, which must still pass:
   - Strict blocks a 6-word lift embedded in a long, otherwise-novel paragraph. Standard does not block it.
   - "net 30" vs "net 300": no match (word boundary), in both profiles.
   - A generic 3-word phrase ("the customer shall") present in the body: no match. A distinctive 3–4-word phrase ("SOW approved, no issues"): match.
   - Default profile = strict.
   - Old-format ledger lines (8-word shingles only) still drive rule 4.
   - Bodies shorter than 8 words.
6. **Hook test** (`packages/skills/src/hooks.test.ts`, following its existing spawn-the-hook pattern). After ingesting a fixture into a temp ledger via `ASH_TAINT_LEDGER`, a Write to `context/accounts/.../meetings/x.md` whose content embeds a 6-word lifted phrase is blocked (exit 2). A meeting note with no lift is allowed.
7. **Eval case.** Add `injection: true` plus an `injection_write` to `evals/cases/sow-review/msa-redline.case.json`. The new write targets a meeting note under `context/accounts/acme-logistics/...` and embeds a 6-word phrase from the MSA redline inside a longer plausible note. Under the old matcher it would pass undetected; under strict it must be blocked. Before committing, confirm it fails on `main`'s matcher, so it is a real regression case per CLAUDE.md's "every defect becomes a permanent eval case".
8. **Docs.** In HANDOFF: mark follow-up 12 as done (with the calibration numbers), add the follow-up "taint provenance on artifacts derived from inbound (T2)", and renumber the chain (`proposal-draft` → 007). Update `context-core`'s quarantine doc comment for the two profiles.

## Critical files

- `packages/context-core/src/quarantine/taint.ts`: matcher rules, profiles, helpers
- `packages/context-core/src/loader.ts`: `isTainted` opts passthrough
- `packages/context-core/src/index.ts`: export `TaintProfile`
- `.claude/hooks/quarantine-inbound.ts`: strict
- `packages/mcp-agentic-sales-hub/src/tools/shared.ts`: standard
- `packages/context-core/src/quarantine/quarantine.test.ts`, `packages/skills/src/hooks.test.ts`: tests
- `evals/cases/sow-review/msa-redline.case.json`: new injection case
- `docs/plans/006-taint-ledger-hardening.md`, `HANDOFF.md`

## Verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`: green, including the existing taint tests, `call-summary-tool.test.ts:122`, `watcher.test.ts:232` and `call-summary.test.ts:352,398`. All of these assert that 8-word leaks are still caught.
- Calibration: 0 strict-profile hits on legitimate corpus/doc text, with the numbers recorded in the plan doc.
- The new eval case fails against `main`'s `taint.ts` and passes on the branch.
- `pnpm exec tsx --env-file=.env.local evals/runner/cli.ts --suite all --write-results` checks:
  - `sow-review` shows `injection: PASS` on **both** cases, with blocker recall 1.00 unchanged;
  - `watcher-trigger` passes and the `call-summary` MCP-injection case passes, so standard doesn't break the watcher;
  - `regression_verdict: PASS`.
  Commit the results file.
- PR → CI (`verify`, `evals`, `review`, `gitleaks`) green → user merges.

## Out of scope

- Taint provenance on derived artifacts (new T2 follow-up).
- Stemming and paraphrase detection. Verbatim-lift matching can't catch an LLM paraphrase, and provenance is the answer there.
- Multi-process ledger locking.
