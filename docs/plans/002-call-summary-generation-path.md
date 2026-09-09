# 002 — call-summary generation path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `call-summary` as the first LLM-backed generation skill — meeting note in, structured cited summary out — and stand up a `generation` eval class (LLM-judge rubric + two deterministic scorers) that gates it.

**Architecture:** New tier-`generation` skill behind the *unchanged* `SkillImpl` seam. The LLM call is isolated in one seam function (`impl/llm.ts`) wrapping `@anthropic-ai/sdk`. Output is validated against a new output-contract JSON Schema (`context/schema/summary-output.json`) compiled *inside `packages/skills`* — no `context-core` change. `runSkill` gains a `generation` branch in its output-contract switch; the eval runner gains `runGenerationSuite()` and a `"call-summary"` suite. Deterministic scorers (citation validity = 1.00, commitment recall ≥ 0.90) reuse existing helpers; the rubric (≥ 4.0/5) calls Sonnet 5 as judge with a committed prompt, retry-median over 3 attempts.

**Tech Stack:** TypeScript (NodeNext ESM), `@anthropic-ai/sdk`, `ajv` (2020 dialect, already a dep of `@agentic-sales-hub/skills`), `vitest`, `tsx`. Node 22 in CI.

---

## Context

Phase 0 proved the deterministic skill path (`find-evidence`, `sow-review`) — see ADR `docs/decisions/0001`. Nothing yet proves the **LLM-backed generation path**: a skill that reads context and writes prose, scored against a golden set. Before committing to three generation skills + the MCP server at once (issue #7's full scope), intent 002 carves out one skill — `call-summary`, the lowest-liability, most-checkable choice — to prove end-to-end that:

1. the `SkillImpl` seam holds an LLM impl with **no** change to `skill-def.schema.json`, `runSkill`'s signature, or the eval-harness interfaces; and
2. generated output can be scored against a golden set the way retrieval and review already are.

Intent: `docs/intent/002-call-summary-generation-path.md` (merged, PR #10). Spec: `docs/specs/002-call-summary-generation-path.md` (merged, PR #11, cold-reviewed). This plan is the Build-stage artifact; per framework §3 it is committed as `docs/plans/002-call-summary-generation-path.md` **before any code**.

**Decisions locked before this plan (spec + cold review):**

| # | Decision |
|---|---|
| OQ1 | `@anthropic-ai/sdk` direct (not the Agent SDK), one seam function. Model portability is an explicit v1 non-goal. |
| OQ2 | Rubric gate is **blocking, on the `evals.yml` critical path**. Retry-median: 3 attempts, median, hard-fail if median < 4.0. `ANTHROPIC_API_KEY` GitHub secret. |
| OQ3 | `context_deltas[]` is structured `{field, observation, citation}` with a `field` enum. |
| OQ4 | Golden set starts as the **3 existing Acme notes**; may add ≤ 2 during calibration; anything more → WI-4. |
| OQ5 | **No `context-core` change.** `runSkill`'s generation branch validates against the raw `summary-output.json` file via a compiled validator that lives *in `packages/skills`* (`src/impl/summary-schema.ts`), mirroring how `registry.ts` already compiles `skill-def.schema.json`. `finding`/`retrieval-result` keep going through the `context-core` registry; `summary-output` deliberately does not. |
| OQ7 | Citation spans are **`[start, end)` byte offsets into the LF-normalized whole file, frontmatter included** — the convention `resolveCitation` already enforces (`packages/context-core/src/provenance/resolve-citation.ts:12`). The impl reads the note via the loader and computes offsets against `normalizeNewlines(rawFileText)`; the plan pins this so citation validity does not fail on an offset-basis mismatch. |
| Models | Skill call: `claude-sonnet-5`. Judge: `claude-sonnet-5`. Both pinned in committed config. |
| JC #1 | "No change to the eval harness" = no change to *signatures, types, the case→score→gate pipeline*. A new switch branch and a new suite function are the same additive extension every existing tier already required. Accepted at cold review. |

**Model ID note (verify at execution):** the system environment states the current model family is "Claude 5" with ID `claude-sonnet-5`. If the SDK rejects that literal, fall back to the newest `claude-sonnet-*` the installed `@anthropic-ai/sdk` version documents, and record the exact string in `evals/judge/judge-model.json` + `packages/skills/src/impl/llm.ts`. This is the one string the plan cannot fully pin ahead of `pnpm install`.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `context/schema/summary-output.json` | Output-contract JSON Schema (draft 2020-12) for the `call-summary` return. Not a disk schema. |
| `packages/skills/src/definitions/call-summary.yaml` | The skill definition (data). Drives the Claude Code skill, the future MCP tool, and the eval runner. |
| `packages/skills/src/impl/llm.ts` | The **only** module that imports `@anthropic-ai/sdk`. Exports one function: `complete({ system, user, model, maxTokens }) => Promise<string>`. One place to audit, stub, or rate-limit. |
| `packages/skills/src/impl/summary-schema.ts` | Compiles `context/schema/summary-output.json` once with ajv2020; exports `validateSummaryOutput(value): { valid: boolean; errors: string[] }` and the `SummaryOutput` TS type. |
| `packages/skills/src/impl/call-summary.ts` | The generation impl. Resolves scope, reads the one note, builds the prompt, calls `complete`, parses + repairs JSON, returns `SkillImplResult<SummaryOutput>`. |
| `packages/skills/src/impl/call-summary.prompt.ts` | The system + user prompt templates for the skill call, as exported string builders. Kept separate so prompt edits are a small reviewable diff. |
| `packages/skills/src/impl/call-summary.test.ts` | Unit tests for the impl with `complete` stubbed (no network). Prompt assembly, JSON parse/repair, scope enforcement, citation-offset basis. |
| `.claude/skills/call-summary/SKILL.md` | **Generated** by `pnpm skills:sync`. Committed. Never hand-edited. |
| `evals/scorers/generation.ts` | `scoreCommitmentRecall(produced, labeled)` — deterministic. |
| `evals/judge/rubric.md` | The four rubric dimensions, 1–5 scale, anchor text per score. Dimensions fixed; anchors calibrated in Task 12. |
| `evals/judge/judge-prompt.md` | Exact judge prompt template. Committed. |
| `evals/judge/judge-model.json` | `{ "model": "claude-sonnet-5", "temperature": 0, "max_tokens": 1024 }`. Committed. |
| `evals/judge/judge.ts` | `scoreRubric(summaryOutput, meetingNoteText, rubric)` — calls the judge model via `impl/llm.ts`'s `complete`, parses per-dimension scores, returns `{ grounding, completeness, tone, structure, aggregate }`. Retry-median lives here. |
| `evals/cases/call-summary/discovery.case.json` | Case referencing `2026-07-14-discovery.md`. |
| `evals/cases/call-summary/demo.case.json` | Case referencing `2026-08-05-demo.md`. |
| `evals/cases/call-summary/negotiation.case.json` | Case referencing `2026-08-28-negotiation.md`. |
| `evals/cases/call-summary/expected/discovery.commitments.json` | Labeled commitments/next-steps for the discovery note. |
| `evals/cases/call-summary/expected/demo.commitments.json` | Labeled commitments/next-steps for the demo note. |
| `evals/cases/call-summary/expected/negotiation.commitments.json` | Labeled commitments/next-steps for the negotiation note. |

### Modified files

| Path | Change |
|---|---|
| `packages/skills/package.json` | Add `"@anthropic-ai/sdk"` to `dependencies`. |
| `packages/skills/src/runner.ts` | Add `call-summary` to `IMPLS`; add a `generation` branch to the output-contract switch. |
| `packages/skills/src/types.ts` | Add `"call-summary"` to `PRODUCT_SKILL_IDS`; export `CallSummaryOutput` type alias. |
| `packages/skills/src/scripts/sync-claude-skills.ts` | No code change needed — the `PRODUCT_SKILL_IDS` filter already picks it up. (Verify: `renderSkillMd` handles `tier: generation`.) |
| `packages/skills/src/index.ts` | Re-export `SummaryOutput` / `CallSummaryOutput` type and (if useful) `validateSummaryOutput`. |
| `evals/runner/run-suite.ts` | Add `"call-summary"` to `SuiteName` + `ALL_SUITES`; add `runGenerationSuite()`; wire it into `runSuite()`. |
| `evals/runner/compare.ts` | Add `"call-summary": ["rubric_aggregate", "citation_validity", "commitment_recall"]` to `PRIMARY` so a drop is a regression. |
| `evals/runner/cli.ts` | Update the usage string to include `call-summary`. |
| `evals/scorers/index.ts` | `export { scoreCommitmentRecall } from "./generation.js"`. |
| `evals/runner/run-suite.test.ts` | Add a `call-summary` end-to-end assertion block (gated on `ANTHROPIC_API_KEY`; `it.skipIf` when absent). |
| `.github/workflows/evals.yml` | Add `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` to the "Run eval suite" step env. |
| `context/schema/README.md` | Add `summary-output.json` to the output-contract-schemas note. |
| `CLAUDE.md` | Under "Current state" / "Eval gates": note `call-summary` exists and its three gates. Keep under 150 lines. |
| `HANDOFF.md` | Update the intent-002 section: plan committed, implementation status. |
| `evals/results/<date>-<sha>.json` | New committed result from the CI run that includes the `call-summary` suite. |

---

## Task 1: Add `@anthropic-ai/sdk` and the LLM seam

**Files:**
- Modify: `packages/skills/package.json`
- Create: `packages/skills/src/impl/llm.ts`
- Test: `packages/skills/src/impl/call-summary.test.ts` (created here, expanded later)

- [ ] **Step 1: Add the dependency**

In `packages/skills/package.json`, add to `dependencies` (keep alphabetical):

```json
"@agentic-sales-hub/context-core": "workspace:*",
"@anthropic-ai/sdk": "~0.32.1",
"ajv": "~8.17.1",
"yaml": "~2.6.1"
```

Then run `pnpm install` from the repo root. Record the version actually resolved.

- [ ] **Step 2: Write the failing test for the seam**

Create `packages/skills/src/impl/call-summary.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { complete, type CompleteArgs } from "./llm.js";

describe("llm seam", () => {
  it("exports complete() with the documented signature", () => {
    expect(typeof complete).toBe("function");
    // shape check only — real calls are integration-tested behind ANTHROPIC_API_KEY
    const args: CompleteArgs = { system: "s", user: "u", model: "claude-sonnet-5", maxTokens: 10 };
    expect(args.model).toBe("claude-sonnet-5");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts`
Expected: FAIL — `Cannot find module './llm.js'`.

- [ ] **Step 4: Implement the seam**

Create `packages/skills/src/impl/llm.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

/** The single seam between our skills and a foundation-model API.
 *  Model portability across vendors is an explicit v1 non-goal — keep this narrow. */
export interface CompleteArgs {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  /** Default 0. Only surfaced for callers that want it; the eval judge pins 0. */
  temperature?: number;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — call-summary and the rubric judge need it. " +
        "In CI it is a GitHub Actions secret; locally, export it before running.",
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

/** One non-streaming completion. Returns the concatenated text of the response. */
export async function complete(args: CompleteArgs): Promise<string> {
  const res = await getClient().messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: args.temperature ?? 0,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Test seam: swap the client (or null to reset). */
export function _setClientForTest(c: unknown): void {
  client = c as Anthropic | null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `@anthropic-ai/sdk` types need `"moduleResolution": "NodeNext"` interop shims like `ajv` does in `registry.ts`, add the same `.default ?? mod` pattern. The SDK ships ESM + types, so a plain default import should work — verify.)

- [ ] **Step 7: Commit**

```bash
git add packages/skills/package.json pnpm-lock.yaml packages/skills/src/impl/llm.ts packages/skills/src/impl/call-summary.test.ts
git commit -m "feat(skills): add @anthropic-ai/sdk and the single LLM seam (impl/llm.ts)"
```

---

## Task 2: The `summary-output.json` output-contract schema

**Files:**
- Create: `context/schema/summary-output.json`
- Modify: `context/schema/README.md`
- Test: covered by `pnpm corpus:validate` (schema well-formedness) + Task 3.

- [ ] **Step 1: Write the schema**

Create `context/schema/summary-output.json` (this is the spec's draft shape, finalized):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-sales-hub.dev/schema/summary-output.json",
  "title": "Call summary (call-summary output contract)",
  "description": "OUTPUT-CONTRACT schema: validates the call-summary skill's structured return, not a file on disk.",
  "type": "object",
  "properties": {
    "summary": { "type": "string", "minLength": 1 },
    "commitments": {
      "type": "array",
      "items": { "$ref": "#/$defs/item" }
    },
    "next_steps": {
      "type": "array",
      "items": { "$ref": "#/$defs/item" }
    },
    "context_deltas": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field": {
            "enum": ["stage", "close_date", "amount", "champion", "risk", "competitor", "next_meeting", "other"]
          },
          "observation": { "type": "string", "minLength": 1 },
          "citation": { "$ref": "#/$defs/citation" }
        },
        "required": ["field", "observation", "citation"],
        "additionalProperties": false
      }
    },
    "citations": {
      "type": "array",
      "items": { "$ref": "#/$defs/citation" }
    },
    "unsourced_claims": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    }
  },
  "required": ["summary", "commitments", "next_steps", "context_deltas", "citations", "unsourced_claims"],
  "additionalProperties": false,
  "$defs": {
    "item": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "minLength": 1 },
        "owner": { "enum": ["us", "counterparty", "unknown"] },
        "citation": { "$ref": "#/$defs/citation" }
      },
      "required": ["text", "owner", "citation"],
      "additionalProperties": false
    },
    "citation": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "span": {
          "type": "array",
          "prefixItems": [
            { "type": "integer", "minimum": 0 },
            { "type": "integer", "minimum": 0 }
          ],
          "minItems": 2,
          "maxItems": 2
        }
      },
      "required": ["path", "span"],
      "additionalProperties": false
    }
  }
}
```

Notes:
- `field` enum gains `next_meeting` vs. the spec draft — the demo + negotiation notes both carry an explicit go-live/next-call date shift, which is the most common delta in the corpus. `stage` and `amount` stay (negotiation note moves both). The plan's licence to finalize the enum (spec OQ3) is exercised here; adjust in Task 11 if a labeled delta doesn't fit.
- `unsourced_claims` is **required** (may be `[]`). Making it required forces the impl to always emit the key, so a missing-key bug surfaces at validation, not silently.
- `additionalProperties: false` everywhere — a model that invents a field fails the contract.

- [ ] **Step 2: Confirm the loader auto-discovers it**

Run: `pnpm vitest run packages/context-core/src/schema/registry.test.ts`
Expected: PASS — `loadSchemas` globs `context/schema/*.json`, so `registry.get("summary-output")` now resolves **without** any `context-core` edit. (We do not add it to `SCHEMA_TYPES`; the `SCHEMA_TYPES` loop test only asserts listed types load, not that every file is listed.)

- [ ] **Step 3: Update the schema README**

In `context/schema/README.md`, extend the output-contract note:

```markdown
`finding.json`, `retrieval-result.json`, and `summary-output.json` are **output-contract**
schemas — they validate a skill's output (`sow-review` findings, `find-evidence` results,
`call-summary` summaries), not a file on disk. They live here because the contract is part
of the published spec.
```

- [ ] **Step 4: Validate the corpus**

Run: `pnpm corpus:validate`
Expected: PASS — 28 files, 0 errors; the new schema is well-formed JSON Schema and compiles.

- [ ] **Step 5: Commit**

```bash
git add context/schema/summary-output.json context/schema/README.md
git commit -m "feat(schema): add summary-output.json output-contract schema for call-summary"
```

---

## Task 3: The in-package compiled validator (`summary-schema.ts`)

**Files:**
- Create: `packages/skills/src/impl/summary-schema.ts`
- Modify: `packages/skills/src/impl/call-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/skills/src/impl/call-summary.test.ts`:

```ts
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";

describe("validateSummaryOutput", () => {
  const good: SummaryOutput = {
    summary: "We ran discovery with Acme. [unsourced] budget is soft.",
    commitments: [
      { text: "Send the Midwest Freight case study", owner: "us", citation: { path: "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md", span: [10, 40] } },
    ],
    next_steps: [],
    context_deltas: [],
    citations: [
      { path: "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md", span: [10, 40] },
    ],
    unsourced_claims: ["budget is soft"],
  };

  it("accepts a well-formed summary output", () => {
    expect(validateSummaryOutput(good).valid).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    const bad = { ...good, extra: 1 } as unknown;
    const r = validateSummaryOutput(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/additional/i);
  });

  it("rejects a commitment missing its citation", () => {
    const bad = { ...good, commitments: [{ text: "x", owner: "us" }] } as unknown;
    expect(validateSummaryOutput(bad).valid).toBe(false);
  });

  it("rejects a missing unsourced_claims key", () => {
    const { unsourced_claims: _omit, ...bad } = good;
    expect(validateSummaryOutput(bad as unknown).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts -t validateSummaryOutput`
Expected: FAIL — `Cannot find module './summary-schema.js'`.

- [ ] **Step 3: Implement the validator**

Create `packages/skills/src/impl/summary-schema.ts`. **Synchronous** — the schema file is tiny and always present, so read it once at module load with `readFileSync` (same shape as `registry.ts` compiling `skill-def.schema.json`). A sync `validateSummaryOutput` keeps every call site (`runner.ts`, the impl, tests) free of `await`.

```ts
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ajv2020Module from "ajv/dist/2020.js";

const Ajv2020 = ((ajv2020Module as unknown as { default?: unknown }).default ??
  ajv2020Module) as unknown as typeof import("ajv/dist/2020.js").default;

export interface Citation {
  path: string;
  span: [number, number];
}
export interface SummaryItem {
  text: string;
  owner: "us" | "counterparty" | "unknown";
  citation: Citation;
}
export type DeltaField =
  | "stage" | "close_date" | "amount" | "champion"
  | "risk" | "competitor" | "next_meeting" | "other";
export interface ContextDelta {
  field: DeltaField;
  observation: string;
  citation: Citation;
}
export interface SummaryOutput {
  summary: string;
  commitments: SummaryItem[];
  next_steps: SummaryItem[];
  context_deltas: ContextDelta[];
  citations: Citation[];
  unsourced_claims: string[];
}

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not locate repo root from summary-schema.ts");
}

const SCHEMA_PATH = join(repoRoot(), "context/schema/summary-output.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a candidate call-summary return against context/schema/summary-output.json.
 *  Compiled in-package — deliberately NOT via context-core's SCHEMA_TYPES registry
 *  (spec OQ5: this slice does not touch context-core). */
export function validateSummaryOutput(value: unknown): ValidationResult {
  const ok = validate(value) as boolean;
  const errors = ok
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim());
  return { valid: ok, errors };
}
```

> If ESLint flags `readFileSync` (check `eslint.config` — `registry.ts` uses async `readFile`, so a rule may exist): fall back to an async `getValidator()` lazily and make `validateSummaryOutput` async, then add `await` at its three call sites (Task 3 tests, Task 6 impl, Task 7 `runner.ts` — `runSkill` is already `async`). Sync is the default; the async fallback is a mechanical change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts`
Expected: PASS (all `validateSummaryOutput` cases).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add packages/skills/src/impl/summary-schema.ts packages/skills/src/impl/call-summary.test.ts
git commit -m "feat(skills): compiled summary-output validator, in-package (no context-core change)"
```

---

## Task 4: The `call-summary` skill definition + generated SKILL.md

**Files:**
- Create: `packages/skills/src/definitions/call-summary.yaml`
- Modify: `packages/skills/src/types.ts`
- Create (generated): `.claude/skills/call-summary/SKILL.md`
- Test: `packages/skills/src/skills.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/skills/src/skills.test.ts`, update the registry test and add a definition test:

```ts
it("loads all three product skill definitions", async () => {
  const skills = await listSkills();
  expect(skills.map((s) => s.id).sort()).toEqual(["call-summary", "find-evidence", "sow-review"]);
});

it("call-summary is a generation skill, meetings read grant only, no write grant", async () => {
  const def = await loadSkill("call-summary");
  expect(def.tier).toBe("generation");
  expect(def.context_grants.read).toEqual(["context/accounts/*/opportunities/*/meetings/**"]);
  expect(def.context_grants.write).toBeUndefined();
  expect(def.tools).toEqual(["context.read"]);
  expect(def.output.schema).toBe("context/schema/summary-output.json");
  expect(def.output.requires_citations).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/skills/src/skills.test.ts -t call-summary`
Expected: FAIL — `unknown skill "call-summary"`.

- [ ] **Step 3: Write the definition**

Create `packages/skills/src/definitions/call-summary.yaml`:

```yaml
id: call-summary
tier: generation
version: 1
description: >-
  Summarize one sales meeting note into a structured call summary — a prose
  recap plus extracted commitments, next steps, and opportunity context deltas,
  each carrying a resolvable citation into the note. Claims with no source are
  marked [unsourced], never asserted. Returns a structured object; a separate
  step (WI-2) persists it.
context_grants:
  read:
    - context/accounts/*/opportunities/*/meetings/**
inputs:
  meeting_path:
    type: string
    required: true
output:
  schema: context/schema/summary-output.json
  requires_citations: true
eval_suite: evals/cases/call-summary/
tools:
  - context.read
```

- [ ] **Step 4: Add to `PRODUCT_SKILL_IDS`**

In `packages/skills/src/types.ts`:

```ts
export const PRODUCT_SKILL_IDS = ["call-summary", "find-evidence", "sow-review"] as const;
```

And add the output type alias near `FindEvidenceOutput` / `SowReviewOutput`:

```ts
export type { SummaryOutput } from "./impl/summary-schema.js";
export type CallSummaryOutput = import("./impl/summary-schema.js").SummaryOutput;
```

- [ ] **Step 5: Generate the SKILL.md**

Run: `pnpm skills:sync`
Expected: writes `.claude/skills/call-summary/SKILL.md`. Open it — verify `renderSkillMd` produced a sane generation-tier doc (no "review" write-grant line; tier shows `generation`; read scope shows the one glob).

- [ ] **Step 6: Drift check + tests**

Run: `pnpm skills:sync:check` → `no drift`.
Run: `pnpm vitest run packages/skills/src/skills.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/skills/src/definitions/call-summary.yaml packages/skills/src/types.ts .claude/skills/call-summary/SKILL.md packages/skills/src/skills.test.ts
git commit -m "feat(skills): call-summary skill definition + generated SKILL.md"
```

---

## Task 5: Prompt templates for the skill call

**Files:**
- Create: `packages/skills/src/impl/call-summary.prompt.ts`
- Modify: `packages/skills/src/impl/call-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `call-summary.test.ts`:

```ts
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";

describe("call-summary prompts", () => {
  it("system prompt states the output contract and the citation rule", () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/summary-output\.json|JSON object/i);
    expect(s).toMatch(/\[unsourced\]/);
    expect(s).toMatch(/byte offset|character offset|span/i);
  });

  it("user prompt embeds the note under a clear delimiter and gives its path", () => {
    const note = "---\nfoo: bar\n---\n\nbody text here";
    const u = buildUserPrompt("context/accounts/acme-logistics/opportunities/OPP/meetings/x.md", note);
    expect(u).toContain("context/accounts/acme-logistics/opportunities/OPP/meetings/x.md");
    expect(u).toContain("body text here");
    expect(u).toMatch(/BEGIN MEETING NOTE|<meeting_note>/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts -t "call-summary prompts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the prompts**

Create `packages/skills/src/impl/call-summary.prompt.ts`:

```ts
/** Prompt templates for the call-summary skill call. Kept in their own module so
 *  a prompt edit is a small, reviewable diff (prompts are eval-gate-relevant). */

export function buildSystemPrompt(): string {
  return [
    "You summarize a single B2B sales meeting note into a structured JSON object.",
    "",
    "Return ONLY a JSON object with exactly these keys:",
    "  summary          - a prose recap (3-8 sentences). Every material claim must be",
    "                     supported by a citation into the note, OR marked inline with",
    "                     the literal token [unsourced] and also listed in unsourced_claims.",
    "  commitments      - array of {text, owner, citation}. Things someone committed to do.",
    "                     owner is 'us' | 'counterparty' | 'unknown'.",
    "  next_steps       - array of {text, owner, citation}. Planned follow-ups not yet owned as commitments.",
    "  context_deltas   - array of {field, observation, citation}. Changes this note implies to the",
    "                     opportunity record. field is one of:",
    "                     stage, close_date, amount, champion, risk, competitor, next_meeting, other.",
    "  citations        - array of {path, span} you relied on overall.",
    "  unsourced_claims - array of strings: every claim you could not source. May be [].",
    "",
    "A citation is {path, span} where path is the meeting-note path given to you and",
    "span is [start, end): character offsets into the note text EXACTLY as provided",
    "(including its frontmatter). The substring note.slice(start, end) must be the",
    "text supporting the claim. Prefer short spans (a sentence or clause).",
    "",
    "Do not invent facts. Do not add keys. Do not wrap the JSON in prose or code fences.",
  ].join("\n");
}

export function buildUserPrompt(meetingPath: string, noteText: string): string {
  return [
    `Meeting note path: ${meetingPath}`,
    "",
    "Character offsets for citations are into the text between the markers below,",
    "starting at 0 at the first character after <<<BEGIN MEETING NOTE>>>\\n.",
    "",
    "<<<BEGIN MEETING NOTE>>>",
    noteText,
    "<<<END MEETING NOTE>>>",
    "",
    "Return the JSON object now.",
  ].join("\n");
}
```

> **Citation-offset basis (spec OQ7 — pinned here):** offsets are into `noteText` as passed to `buildUserPrompt`, which is `normalizeNewlines(rawFileText)` — the **whole file including frontmatter**, LF-normalized. This is exactly what `loader.resolveCitation` slices (`resolve-citation.ts:12`). The impl (Task 6) must pass the loader's normalized raw file text, not a body-stripped version, and must not prepend anything to `noteText` inside the markers.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts -t "call-summary prompts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/skills/src/impl/call-summary.prompt.ts packages/skills/src/impl/call-summary.test.ts
git commit -m "feat(skills): call-summary prompt templates (offset basis pinned to whole-file LF)"
```

---

## Task 6: The `call-summary` impl

**Files:**
- Create: `packages/skills/src/impl/call-summary.ts`
- Modify: `packages/skills/src/impl/call-summary.test.ts`

- [ ] **Step 1: Write failing tests (network stubbed)**

Append to `call-summary.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLoader, type ContextLoader } from "@agentic-sales-hub/context-core";
import { callSummaryImpl } from "./call-summary.js";
import * as llm from "./llm.js";
import { loadSkill } from "../registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const OPP = "006Ax0000GkLmNpQAA";
const notePath =
  `context/accounts/acme-logistics/opportunities/${OPP}/meetings/2026-07-14-discovery.md`;

describe("call-summary impl (stubbed model)", () => {
  let loader: ContextLoader;
  beforeAll(async () => {
    loader = await createLoader({
      repoRoot,
      taintLedgerPath: join(repoRoot, ".claude/.taint-ledger.test.jsonl"),
    });
  });

  it("returns a schema-valid output and only reads the one note", async () => {
    // Build a valid stub response whose spans actually resolve.
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(join(repoRoot, notePath), "utf8"),
    );
    const norm = raw.replace(/\r\n/g, "\n");
    const idx = norm.indexOf("Midwest Freight");
    const span: [number, number] = [idx, idx + "Midwest Freight".length];
    const stub = JSON.stringify({
      summary: "Discovery call with Acme Logistics about a single exception queue.",
      commitments: [
        { text: "Send Midwest Freight case study", owner: "us", citation: { path: notePath, span } },
      ],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: notePath, span }],
      unsourced_claims: [],
    });
    const spy = vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const def = await loadSkill("call-summary");
    const res = await callSummaryImpl.run(
      { meeting_path: notePath },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
      def,
    );

    expect(res.contextRead).toEqual([notePath]);
    expect(res.scopeResolved).toContain(notePath);
    expect((res.output as { summary: string }).summary.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it("throws a clear error when the model returns non-JSON", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue("here is your summary: ...");
    const def = await loadSkill("call-summary");
    await expect(
      callSummaryImpl.run(
        { meeting_path: notePath },
        { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
        def,
      ),
    ).rejects.toThrow(/did not return valid JSON|schema/i);
    spy.mockRestore();
  });

  it("rejects a meeting_path outside the resolved scope", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue("{}");
    const def = await loadSkill("call-summary");
    await expect(
      callSummaryImpl.run(
        { meeting_path: "context/org/company.md" },
        { loader, scopeParams: { accountSlug: "acme-logistics", oppId: OPP } },
        def,
      ),
    ).rejects.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts -t "call-summary impl"`
Expected: FAIL — module `./call-summary.js` not found.

- [ ] **Step 3: Implement**

Create `packages/skills/src/impl/call-summary.ts`:

```ts
import type { SkillDefinition } from "@agentic-sales-hub/context-core";
import type { RunContext, SkillImpl, SkillImplResult, TraceEntry } from "../types.js";
import { complete } from "./llm.js";
import { buildSystemPrompt, buildUserPrompt } from "./call-summary.prompt.js";
import { validateSummaryOutput, type SummaryOutput } from "./summary-schema.js";

interface CallSummaryInput {
  meeting_path: string;
}

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2048;

/** Extract the first balanced top-level JSON object from a model response. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export const callSummaryImpl: SkillImpl<CallSummaryInput, SummaryOutput> = {
  async run(
    input: CallSummaryInput,
    ctx: RunContext,
    def: SkillDefinition,
  ): Promise<SkillImplResult<SummaryOutput>> {
    const trace: TraceEntry[] = [];

    // 1. Resolve scope from the skill's grant + the opp derived from ctx.scopeParams.
    const scopeResolved = await ctx.loader.resolveScope(def.context_grants, ctx.scopeParams);
    trace.push({ step: "resolveScope", detail: `${scopeResolved.length} files in scope` });

    // 2. The requested note must be in scope. runSkill re-checks contextRead too;
    //    this gives a clearer message and avoids an LLM call on an out-of-scope path.
    if (!scopeResolved.includes(input.meeting_path)) {
      throw new Error(
        `call-summary: meeting_path ${input.meeting_path} is not within the resolved scope`,
      );
    }

    // 3. Read the note through the loader. `file.raw` is the full file content,
    //    LF-normalized (context-core/src/types.ts:69) — the exact basis
    //    resolveCitation slices against. No re-normalization needed.
    const file = await ctx.loader.read(input.meeting_path);
    const noteText = file.raw;
    trace.push({ step: "readNote", detail: `${noteText.length} chars` });

    // 4. Call the model behind the seam.
    const responseText = await complete({
      system: buildSystemPrompt(),
      user: buildUserPrompt(input.meeting_path, noteText),
      model: MODEL,
      maxTokens: MAX_TOKENS,
    });
    trace.push({ step: "model", detail: `${responseText.length} chars returned` });

    // 5. Parse + validate.
    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      throw new Error("call-summary: model did not return valid JSON");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("call-summary: model did not return valid JSON");
    }
    const check = validateSummaryOutput(parsed);
    if (!check.valid) {
      throw new Error(`call-summary: output failed schema — ${check.errors.slice(0, 5).join("; ")}`);
    }

    return {
      output: parsed as SummaryOutput,
      scopeResolved,
      contextRead: [input.meeting_path],
      trace,
    };
  },
};
```

> **Confirmed against `packages/context-core/src/types.ts:56-77`:** `ContextFile` exposes `raw` — "The full original file content, LF-normalized" — and `bytes` (its length). `file.raw` is exactly what `resolveCitation` slices against (`resolve-citation.ts:33` does `normalizeNewlines(readFile(...))`), so citation offsets the model produces against `noteText` resolve without any offset-basis conversion. No `node:fs` read, no `absPath`, no `context-core` change.

- [ ] **Step 4: Run the impl tests**

Run: `pnpm vitest run packages/skills/src/impl/call-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add packages/skills/src/impl/call-summary.ts packages/skills/src/impl/call-summary.test.ts
git commit -m "feat(skills): call-summary impl — reads one note, calls model behind the seam, validates output"
```

---

## Task 7: Wire `call-summary` into `runSkill` (the `generation` branch)

**Files:**
- Modify: `packages/skills/src/runner.ts`
- Modify: `packages/skills/src/skills.test.ts`

- [ ] **Step 1: Write the failing test**

In `skills.test.ts`, add (stubbing the model at the `llm` module):

```ts
import * as llm from "./impl/llm.js";
import { readFile as _rf } from "node:fs/promises";

describe("runSkill generation branch (call-summary, stubbed)", () => {
  it("validates output against summary-output.json and sets citationsValid", async () => {
    const notePath =
      "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md";
    const raw = (await _rf(join(repoRoot, notePath), "utf8")).replace(/\r\n/g, "\n");
    const i = raw.indexOf("exception queue");
    const span = [i, i + "exception queue".length];
    const stub = JSON.stringify({
      summary: "Acme wants one exception queue.",
      commitments: [],
      next_steps: [{ text: "SE technical deep dive with Acme IT", owner: "us", citation: { path: notePath, span } }],
      context_deltas: [],
      citations: [{ path: notePath, span }],
      unsourced_claims: [],
    });
    const spy = vi.spyOn(llm, "complete").mockResolvedValue(stub);

    const result = await runSkill(
      "call-summary",
      { meeting_path: notePath },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: "006Ax0000GkLmNpQAA" } },
    );

    expect(result.citationsValid).toBe(true);
    expect((result.output as { summary: string }).summary).toContain("exception queue");
    spy.mockRestore();
  });

  it("fails the run when a citation span does not resolve", async () => {
    const notePath =
      "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md";
    const stub = JSON.stringify({
      summary: "x",
      commitments: [],
      next_steps: [],
      context_deltas: [],
      citations: [{ path: notePath, span: [999999, 1000000] }],
      unsourced_claims: [],
    });
    const spy = vi.spyOn(llm, "complete").mockResolvedValue(stub);
    const result = await runSkill(
      "call-summary",
      { meeting_path: notePath },
      { loader, scopeParams: { accountSlug: "acme-logistics", oppId: "006Ax0000GkLmNpQAA" } },
    );
    expect(result.citationsValid).toBe(false);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/skills/src/skills.test.ts -t "runSkill generation branch"`
Expected: FAIL — `no implementation registered for skill "call-summary"`.

- [ ] **Step 3: Register the impl + add the branch**

In `packages/skills/src/runner.ts`:

```ts
import { callSummaryImpl } from "./impl/call-summary.js";
import { validateSummaryOutput } from "./impl/summary-schema.js";

const IMPLS: Record<string, SkillImpl> = {
  "call-summary": callSummaryImpl as unknown as SkillImpl,
  "find-evidence": findEvidenceImpl as unknown as SkillImpl,
  "sow-review": sowReviewImpl as unknown as SkillImpl,
};
```

Then extend the output-contract switch (after the `review` branch):

```ts
  } else if (def.tier === "generation") {
    const check = validateSummaryOutput(result.output);
    if (!check.valid) {
      throw new Error(
        `${id} output does not satisfy ${def.output.schema}: ${check.errors.slice(0, 5).join("; ")}`,
      );
    }
    if (def.output.requires_citations) {
      citationsValid = await checkGenerationCitations(ctx, result.output as SummaryLike);
    }
  }
```

Add the helper + type near `checkRetrievalCitations`:

```ts
interface CitationRef { path: string; span: [number, number] }
interface SummaryLike {
  commitments: { citation: CitationRef }[];
  next_steps: { citation: CitationRef }[];
  context_deltas: { citation: CitationRef }[];
  citations: CitationRef[];
}

/** Generation citation validity = resolve-only over the flattened citation set.
 *  No `position` to verify (unlike sow-review). Spec JC #8. */
async function checkGenerationCitations(ctx: RunContext, out: SummaryLike): Promise<boolean> {
  const all: CitationRef[] = [
    ...out.citations,
    ...out.commitments.map((c) => c.citation),
    ...out.next_steps.map((c) => c.citation),
    ...out.context_deltas.map((c) => c.citation),
  ];
  for (const c of all) {
    try {
      await ctx.loader.resolveCitation({ path: c.path, span: c.span });
    } catch {
      return false;
    }
  }
  return true;
}
```

`runSkill`'s parameter list and return type are **unchanged** — this is a switch-branch extension (spec JC #1).

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/skills/src/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Full package check + commit**

```bash
pnpm typecheck && pnpm vitest --project skills
git add packages/skills/src/runner.ts packages/skills/src/skills.test.ts
git commit -m "feat(skills): runSkill generation branch — schema + resolve-only citation check"
```

---

## Task 8: `scoreCommitmentRecall` deterministic scorer

**Files:**
- Create: `evals/scorers/generation.ts`
- Modify: `evals/scorers/index.ts`
- Test: `evals/scorers/scorers.test.ts`

- [ ] **Step 1: Write the failing test**

In `evals/scorers/scorers.test.ts` add:

```ts
import { scoreCommitmentRecall } from "./generation.js";

describe("scoreCommitmentRecall", () => {
  const labeled = [
    { text: "Send the Midwest Freight case study" },
    { text: "SE to run a technical deep dive with Acme IT" },
    { text: "Send Pat the MSA and SOW for legal review" },
  ];

  it("counts a fuzzy match as covered", () => {
    const produced = {
      commitments: [{ text: "AE will send Midwest Freight case study to Dana" }],
      next_steps: [{ text: "SE technical deep dive w/ their IT team" }],
    };
    const r = scoreCommitmentRecall(produced, labeled);
    expect(r.covered).toBe(2);
    expect(r.recall).toBeCloseTo(2 / 3);
  });

  it("recall is 1 when every label is covered", () => {
    const produced = {
      commitments: labeled.map((l) => ({ text: l.text })),
      next_steps: [],
    };
    expect(scoreCommitmentRecall(produced, labeled).recall).toBe(1);
  });

  it("empty labels => recall 1", () => {
    expect(scoreCommitmentRecall({ commitments: [], next_steps: [] }, []).recall).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run evals/scorers/scorers.test.ts -t scoreCommitmentRecall`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `evals/scorers/generation.ts`. Reuse the normalized-token-overlap idea from `scoreReview`/`covers` (see `evals/scorers/review.ts`, `evals/scorers/retrieval.ts`):

```ts
export interface LabeledCommitment {
  text: string;
}
export interface ProducedItems {
  commitments: { text: string }[];
  next_steps: { text: string }[];
}
export interface CommitmentRecallScore {
  recall: number;
  covered: number;
  total: number;
  misses: string[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((t) => t.length > 2));
}

/** A label is covered if some produced commitment/next_step shares >= 0.5 of the
 *  label's content tokens (Jaccard-style over the label's token set). */
function isCovered(label: string, produced: { text: string }[]): boolean {
  const lt = tokens(label);
  if (lt.size === 0) return produced.length > 0;
  for (const p of produced) {
    const pt = tokens(p.text);
    let hit = 0;
    for (const t of lt) if (pt.has(t)) hit++;
    if (hit / lt.size >= 0.5) return true;
  }
  return false;
}

export function scoreCommitmentRecall(
  produced: ProducedItems,
  labeled: LabeledCommitment[],
): CommitmentRecallScore {
  const pool = [...produced.commitments, ...produced.next_steps];
  const misses: string[] = [];
  let covered = 0;
  for (const l of labeled) {
    if (isCovered(l.text, pool)) covered++;
    else misses.push(l.text);
  }
  return {
    recall: labeled.length === 0 ? 1 : covered / labeled.length,
    covered,
    total: labeled.length,
    misses,
  };
}
```

Add to `evals/scorers/index.ts`:

```ts
export { scoreCommitmentRecall } from "./generation.js";
export type { CommitmentRecallScore, LabeledCommitment } from "./generation.js";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run evals/scorers/scorers.test.ts`
Expected: PASS. Tune the `0.5` threshold / `length > 2` stopword filter only if a genuine match misses — record any change in the file's doc comment.

- [ ] **Step 5: Commit**

```bash
git add evals/scorers/generation.ts evals/scorers/index.ts evals/scorers/scorers.test.ts
git commit -m "feat(evals): scoreCommitmentRecall deterministic scorer for the generation class"
```

---

## Task 9: Judge harness — rubric, prompt, model config, `scoreRubric`

**Files:**
- Create: `evals/judge/rubric.md`, `evals/judge/judge-prompt.md`, `evals/judge/judge-model.json`, `evals/judge/judge.ts`
- Test: `evals/judge/judge.test.ts`

- [ ] **Step 1: Write the rubric (dimensions fixed; anchors are a first cut, calibrated in Task 12)**

`evals/judge/rubric.md`:

```markdown
# call-summary rubric (v1)

Four dimensions, scored 1-5. Aggregate = mean of the four. Gate: aggregate >= 4.0.

## grounding
Does every material claim in `summary` and every commitment / next_step / context_delta
trace to something actually in the note?
- 5: every claim is supported by the cited span; no drift, no invention; [unsourced] used correctly where the note is silent.
- 4: claims supported; at most one citation points at a loosely-related span.
- 3: one unsupported claim stated as fact, or [unsourced] missing on a soft claim.
- 2: multiple unsupported claims, or a citation contradicts its claim.
- 1: summary asserts things the note does not say.

## completeness
Are the commitments, next steps, and material context changes in the note all captured?
- 5: every commitment and next step a competent reader would extract is present; key deltas captured.
- 4: one minor next step missed.
- 3: one clear commitment or a material delta missed.
- 2: several missed, or the main outcome of the meeting is absent.
- 1: summary misses the point of the call.

## tone
Is it a neutral internal recap — no hype, no hedging, no counterparty spin presented as fact?
- 5: crisp, factual, reads like a good rep's own notes.
- 4: minor wordiness or mild editorializing.
- 3: noticeable spin or salesy framing.
- 2: reads like marketing copy or is evasive.
- 1: misleading tone.

## structure
Is the JSON well-formed against the contract and are fields used as intended
(owner correct, delta.field sensible, spans short)?
- 5: contract-valid; owners and fields all correct; spans tight.
- 4: contract-valid; one questionable owner or an over-long span.
- 3: contract-valid but several fields misused.
- 2: contract-valid by luck; fields mostly ignored.
- 1: would not have validated without repair.
```

- [ ] **Step 2: Write the judge prompt**

`evals/judge/judge-prompt.md`:

```markdown
You are scoring a machine-generated summary of a sales meeting note against a rubric.
You are given: the ORIGINAL NOTE, the SUMMARY OUTPUT (JSON), and the RUBRIC.

Score each of the four rubric dimensions from 1 to 5 (integers). Be strict: 5 means
no reservations. Then output ONLY this JSON object, no prose:

{"grounding": N, "completeness": N, "tone": N, "structure": N}

RUBRIC:
{{RUBRIC}}

ORIGINAL NOTE:
<<<BEGIN NOTE>>>
{{NOTE}}
<<<END NOTE>>>

SUMMARY OUTPUT:
<<<BEGIN OUTPUT>>>
{{OUTPUT}}
<<<END OUTPUT>>>
```

- [ ] **Step 3: Write the model config**

`evals/judge/judge-model.json`:

```json
{ "model": "claude-sonnet-5", "temperature": 0, "max_tokens": 256, "attempts": 3 }
```

- [ ] **Step 4: Write the failing test**

`evals/judge/judge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import * as llm from "../../packages/skills/src/impl/llm.js";
import { scoreRubric, aggregate } from "./judge.js";

describe("scoreRubric", () => {
  it("aggregates the four dimensions as their mean", () => {
    expect(aggregate({ grounding: 4, completeness: 4, tone: 4, structure: 4 })).toBe(4);
    expect(aggregate({ grounding: 5, completeness: 4, tone: 4, structure: 3 })).toBe(4);
  });

  it("takes the median across attempts", async () => {
    const spy = vi
      .spyOn(llm, "complete")
      .mockResolvedValueOnce('{"grounding":3,"completeness":3,"tone":3,"structure":3}')
      .mockResolvedValueOnce('{"grounding":5,"completeness":5,"tone":5,"structure":5}')
      .mockResolvedValueOnce('{"grounding":4,"completeness":4,"tone":4,"structure":4}');
    const r = await scoreRubric({ summary: "x" } as never, "note text", { attempts: 3 });
    expect(r.aggregate).toBe(4); // medians of [3,4,5] per dim -> 4
    spy.mockRestore();
  });

  it("throws if the judge never returns parseable scores", async () => {
    const spy = vi.spyOn(llm, "complete").mockResolvedValue("nope");
    await expect(scoreRubric({ summary: "x" } as never, "n", { attempts: 3 })).rejects.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm vitest run evals/judge/judge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `judge.ts`**

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { complete } from "../../packages/skills/src/impl/llm.js";
import type { SummaryOutput } from "../../packages/skills/src/impl/summary-schema.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface RubricScores {
  grounding: number;
  completeness: number;
  tone: number;
  structure: number;
}
export interface RubricResult extends RubricScores {
  aggregate: number;
  attempts: RubricScores[];
}

export function aggregate(s: RubricScores): number {
  return Math.round(((s.grounding + s.completeness + s.tone + s.structure) / 4) * 100) / 100;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function parseScores(text: string): RubricScores | null {
  const m = text.match(/\{[^}]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const keys = ["grounding", "completeness", "tone", "structure"] as const;
    const out = {} as RubricScores;
    for (const k of keys) {
      const v = o[k];
      if (typeof v !== "number" || v < 1 || v > 5) return null;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

interface Cfg { model: string; temperature: number; max_tokens: number; attempts: number }
let cfg: Cfg | null = null;
async function loadCfg(): Promise<Cfg> {
  if (cfg) return cfg;
  cfg = JSON.parse(await readFile(join(here, "judge-model.json"), "utf8")) as Cfg;
  return cfg;
}

export async function scoreRubric(
  output: SummaryOutput,
  noteText: string,
  opts?: { attempts?: number },
): Promise<RubricResult> {
  const c = await loadCfg();
  const attempts = opts?.attempts ?? c.attempts;
  const rubric = await readFile(join(here, "rubric.md"), "utf8");
  const template = await readFile(join(here, "judge-prompt.md"), "utf8");
  const user = template
    .replace("{{RUBRIC}}", rubric)
    .replace("{{NOTE}}", noteText)
    .replace("{{OUTPUT}}", JSON.stringify(output, null, 2));

  const got: RubricScores[] = [];
  for (let i = 0; i < attempts; i++) {
    const text = await complete({
      system: "You are a strict evaluation judge. Output only the requested JSON.",
      user,
      model: c.model,
      maxTokens: c.max_tokens,
      temperature: c.temperature,
    });
    const s = parseScores(text);
    if (s) got.push(s);
  }
  if (got.length === 0) {
    throw new Error("rubric judge returned no parseable scores across all attempts");
  }
  const merged: RubricScores = {
    grounding: median(got.map((g) => g.grounding)),
    completeness: median(got.map((g) => g.completeness)),
    tone: median(got.map((g) => g.tone)),
    structure: median(got.map((g) => g.structure)),
  };
  return { ...merged, aggregate: aggregate(merged), attempts: got };
}
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run evals/judge/judge.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add evals/judge/
git commit -m "feat(evals): judge harness — rubric, prompt, model config, scoreRubric (retry-median)"
```

---

## Task 10: The three golden cases + labeled commitments

**Files:**
- Create: `evals/cases/call-summary/{discovery,demo,negotiation}.case.json`
- Create: `evals/cases/call-summary/expected/{discovery,demo,negotiation}.commitments.json`

- [ ] **Step 1: Write the case files**

`evals/cases/call-summary/discovery.case.json`:

```json
{
  "id": "discovery",
  "skill": "call-summary",
  "input": {
    "meeting_path": "context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/2026-07-14-discovery.md"
  },
  "scope_params": { "account_slug": "acme-logistics", "opp_id": "006Ax0000GkLmNpQAA" },
  "expected_commitments_ref": "expected/discovery.commitments.json"
}
```

`demo.case.json` and `negotiation.case.json`: identical shape, pointing at `2026-08-05-demo.md` / `2026-08-28-negotiation.md`, ids `demo` / `negotiation`, refs `expected/demo.commitments.json` / `expected/negotiation.commitments.json`.

- [ ] **Step 2: Label the commitments** — read each note's `## next` section and body, list what a competent rep must extract.

`evals/cases/call-summary/expected/discovery.commitments.json`:

```json
[
  { "text": "SE to run a technical deep dive with Acme IT" },
  { "text": "Send the Midwest Freight case study" },
  { "text": "Produce a rough SOW shape and number for Dana to take to Pat Morgan" },
  { "text": "Follow up on the carrier onboarding time (weeks, no number given)" }
]
```

`evals/cases/call-summary/expected/demo.commitments.json`:

```json
[
  { "text": "Produce a SOW draft with the NTE number" },
  { "text": "Send Pat the MSA and SOW for legal review" },
  { "text": "Send Pat the change-order language" },
  { "text": "Priya to provide the integration-design intake (systems, credentials, SMEs)" },
  { "text": "SE to deliver the integration design doc before the scorecard connector is built" }
]
```

`evals/cases/call-summary/expected/negotiation.commitments.json`:

```json
[
  { "text": "Paper the restructured commercials: base SOW ~150 plus the carrier-scorecard connector as a change order" },
  { "text": "Confirm the Nov 1 go-live in the SOW schedule" },
  { "text": "Acme counsel to send MSA and SOW redlines this week" },
  { "text": "Review the counterparty redlines quickly — this is now the close gate" }
]
```

> These labels are the deterministic **commitment-recall** target (≥ 0.90). Keep them to things unambiguously in the note. If Task 12 calibration shows a label is genuinely ambiguous, remove it (recall target is about *not missing real commitments*, not trivia).

- [ ] **Step 3: Commit**

```bash
git add evals/cases/call-summary/
git commit -m "test(evals): call-summary golden set — 3 Acme notes + labeled commitments"
```

---

## Task 11: `runGenerationSuite()` in the eval runner

**Files:**
- Modify: `evals/runner/run-suite.ts`, `evals/runner/compare.ts`, `evals/runner/cli.ts`
- Modify: `evals/runner/run-suite.test.ts`

- [ ] **Step 1: Write the failing test** (gated on the API key so local runs without it still pass)

In `evals/runner/run-suite.test.ts`:

```ts
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_KEY)("call-summary suite (needs ANTHROPIC_API_KEY)", () => {
  it("clears all three gates on the golden set", async () => {
    const r = await runSuite("call-summary");
    expect(r.gates.citation_validity).toBe("PASS");
    expect(r.gates.commitment_recall).toBe("PASS");
    expect(r.gates.rubric_aggregate).toBe("PASS");
    expect(r.aggregate.citation_validity).toBe(1);
    expect(r.aggregate.commitment_recall).toBeGreaterThanOrEqual(0.9);
    expect(r.aggregate.rubric_aggregate).toBeGreaterThanOrEqual(4.0);
  }, 120_000);
});

it("ALL_SUITES includes call-summary", () => {
  expect(ALL_SUITES).toContain("call-summary");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run evals/runner/run-suite.test.ts -t "ALL_SUITES includes call-summary"`
Expected: FAIL — `call-summary` not in `ALL_SUITES`.

- [ ] **Step 3: Extend `run-suite.ts`**

```ts
export type SuiteName = "sow-review" | "find-evidence" | "call-summary";
export const ALL_SUITES: SuiteName[] = ["sow-review", "find-evidence", "call-summary"];
```

`runSuite()`:

```ts
export async function runSuite(suite: SuiteName): Promise<SuiteResult> {
  if (suite === "sow-review") return runReviewSuite();
  if (suite === "find-evidence") return runRetrievalSuite();
  return runGenerationSuite();
}
```

Add the suite function + case interface:

```ts
import { scoreCommitmentRecall } from "../scorers/index.js";
import { scoreRubric } from "../judge/judge.js";
import { readFile as readFileRaw } from "node:fs/promises";
import { normalizeNewlines } from "@agentic-sales-hub/context-core";

interface CallSummaryCase {
  id: string;
  skill: "call-summary";
  input: { meeting_path: string };
  scope_params: { account_slug?: string; opp_id?: string };
  expected_commitments_ref: string;
}

async function runGenerationSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "call-summary");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as CallSummaryCase;
    const labeled = JSON.parse(
      await readFile(join(dir, c.expected_commitments_ref), "utf8"),
    ) as { text: string }[];

    const loader = await makeLoader();
    const result = await runSkill(
      "call-summary",
      { meeting_path: c.input.meeting_path },
      { loader, scopeParams: toScopeParams(c.scope_params) },
    );
    const output = result.output as {
      summary: string;
      commitments: { text: string }[];
      next_steps: { text: string }[];
    };

    const recall = scoreCommitmentRecall(
      { commitments: output.commitments, next_steps: output.next_steps },
      labeled,
    );

    const noteText = normalizeNewlines(
      await readFileRaw(join(REPO_ROOT, c.input.meeting_path), "utf8"),
    );
    const rubric = await scoreRubric(output as never, noteText);

    const citationValidity = result.citationsValid === true ? 1 : 0;

    const metrics = {
      rubric_aggregate: round(rubric.aggregate),
      commitment_recall: round(recall.recall),
      citation_validity: citationValidity,
    };
    const gates: Record<string, "PASS" | "FAIL"> = {
      rubric_aggregate: rubric.aggregate >= 4.0 ? "PASS" : "FAIL",
      commitment_recall: recall.recall >= 0.9 ? "PASS" : "FAIL",
      citation_validity: citationValidity >= 1 ? "PASS" : "FAIL",
    };
    const notes: string[] = [];
    if (recall.misses.length) notes.push(`missed commitments: ${recall.misses.join("; ")}`);
    notes.push(
      `rubric dims: g=${rubric.grounding} c=${rubric.completeness} t=${rubric.tone} s=${rubric.structure} (${rubric.attempts.length} attempts)`,
    );

    cases.push({ id: c.id, metrics, gates, injectionBlocked: null, notes });
  }

  return aggregateSuite("call-summary", cases);
}
```

`aggregateSuite` and `CaseResult`/`SuiteResult` are **unchanged** — they already iterate metrics/gates generically. `SuiteName` widening is the only type edit.

- [ ] **Step 4: Extend `compare.ts`**

```ts
const PRIMARY: Record<string, string[]> = {
  "sow-review": ["blocker_recall", "precision", "citation_validity"],
  "find-evidence": ["recall", "citation_validity"],
  "call-summary": ["rubric_aggregate", "commitment_recall", "citation_validity"],
};
```

- [ ] **Step 5: Update `cli.ts` usage strings** — replace the two `<sow-review|find-evidence|all>` occurrences with `<sow-review|find-evidence|call-summary|all>`.

- [ ] **Step 6: Run the runner tests**

Run: `pnpm vitest run evals/runner/run-suite.test.ts`
Expected: PASS. The `call-summary` end-to-end block is `skipIf(!HAS_KEY)` — locally without a key it is skipped; the `ALL_SUITES` assertion runs.

- [ ] **Step 7: Local live smoke (requires `ANTHROPIC_API_KEY`)**

Run: `ANTHROPIC_API_KEY=sk-... pnpm eval --suite call-summary --no-compare`
Expected: a table with `rubric_aggregate`, `commitment_recall`, `citation_validity` per case + aggregate. Note the numbers — they seed Task 12.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck
git add evals/runner/run-suite.ts evals/runner/compare.ts evals/runner/cli.ts evals/runner/run-suite.test.ts
git commit -m "feat(evals): runGenerationSuite() + call-summary in SuiteName/ALL_SUITES/compare"
```

---

## Task 12: Calibrate rubric anchors + set the tolerance band

**Files:**
- Modify: `evals/judge/rubric.md` (anchor text only — dimensions and the 4.0 gate are fixed)
- Modify: `evals/cases/call-summary/expected/*.commitments.json` (only to drop a genuinely ambiguous label)
- Create: `evals/judge/README.md` (documents the tolerance band + observed variance)
- **This is the only task that is exploratory.** Spec OQ6: anchors can only be finalized against real output.

- [ ] **Step 1: Generate real output for all three cases**

Run `pnpm eval --suite call-summary --no-compare` (with the key) **5 times**. Record per-run per-case `rubric_aggregate` and the four dimensions.

- [ ] **Step 2: Assess**
  - If every run's aggregate ≥ 4.0 across all three cases and the spread (max−min of the aggregate for a given case) ≤ 0.3 → anchors are fine; set the documented tolerance band to the observed spread rounded up to the nearest 0.1 (floor 0.3).
  - If a case sits at 3.6–3.9: read the summary. Is the model genuinely weak (fix the *skill* prompt in `call-summary.prompt.ts`), or is an anchor too harsh (adjust the anchor text — e.g. "at most one citation points at a loosely-related span" for grounding-4)? Prefer fixing the prompt; only soften an anchor if it's punishing correct behavior.
  - If a case swings > 0.5 between runs: the judge is unstable. Raise `attempts` in `judge-model.json` to 5, re-run. If still unstable, tighten `judge-prompt.md` (e.g. "Award 5 only if you can name zero specific problems").
  - If commitment-recall < 0.90 on a case: check the misses. A real miss → fix the skill prompt to ask explicitly for every follow-up. An over-strict label → drop it (max 2 label removals total; document why in the commitments file via a top-level `"_note"` — actually JSON arrays can't hold that, so document in `evals/judge/README.md`).

- [ ] **Step 3: If 3 cases prove too thin to calibrate** (e.g. all three are "easy" and give no signal on the grounding-3/4 boundary), author **≤ 2** new `acme-logistics` meeting notes under `context/accounts/acme-logistics/opportunities/006Ax0000GkLmNpQAA/meetings/`:
  - Must be `fictional: true`, `mutability: accumulating`, `schema_version: "1.0.0"`, validate against `meeting.json`.
  - Pick scenarios that stress the rubric: e.g. a short internal-sync note with few commitments (tests completeness sensitivity), or a note where the counterparty makes claims the rep transcribes (tests the grounding/tone boundary — the summary must not present counterparty spin as fact).
  - Add matching `.case.json` + `expected/*.commitments.json`.
  - Run `pnpm corpus:validate` and `pnpm check:no-real-data` — both must stay green.
  - **Hard stop at 5 total cases.** More corpus → WI-4, separate intent.

- [ ] **Step 4: Write `evals/judge/README.md`**

```markdown
# call-summary judge

- Rubric: `rubric.md` (v1). Four dimensions, mean-aggregated. Gate: aggregate >= 4.0 (fixed).
- Judge model: `judge-model.json` — `claude-sonnet-5`, temperature 0.
- Retry policy: `attempts` completions per case, median per dimension, then aggregate.
- Observed variance (calibration, N=5 runs x M cases): aggregate spread <= X.XX per case.
- Documented tolerance band: **±0.3** (or the observed spread, whichever is larger).
  A re-run of `pnpm eval --suite call-summary` whose aggregate moves more than this
  from the committed result is investigated before the result is re-committed.
- The 4.0 gate is not a calibration knob. If real output cannot clear 4.0, the fix is
  the skill prompt (`packages/skills/src/impl/call-summary.prompt.ts`), not the gate.
```

- [ ] **Step 5: Full eval run + commit**

Run: `pnpm eval --suite all --no-compare` (with key) — all suites green.

```bash
git add evals/judge/ evals/cases/call-summary/ packages/skills/src/impl/call-summary.prompt.ts context/
git commit -m "test(evals): calibrate call-summary rubric anchors + document tolerance band"
```

---

## Task 13: CI wiring — `ANTHROPIC_API_KEY` in `evals.yml`

**Files:**
- Modify: `.github/workflows/evals.yml`

- [ ] **Step 1: Add the secret to the eval step**

In `.github/workflows/evals.yml`, the "Run eval suite" step:

```yaml
      - name: Run eval suite
        env:
          CI: "true"
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: pnpm eval --suite all --json-out this-run.json || echo "EVAL_FAILED=1" >> "$GITHUB_ENV"
```

- [ ] **Step 2: Fail-closed guard when the key is absent** — the `call-summary` suite must not silently pass.

The guard already exists structurally: `impl/llm.ts`'s `getClient()` throws a clear error when `ANTHROPIC_API_KEY` is unset, `runGenerationSuite()` lets it propagate, `runSuite` rejects, `cli.ts`'s loop is not `try`-wrapped so the process exits non-zero and `EVAL_FAILED=1` is set → the "Fail on gate breach or regression" step fails the job. Add a comment in `evals.yml` above the step:

```yaml
      # call-summary's rubric + skill call need ANTHROPIC_API_KEY. If the secret is
      # absent (e.g. a fork PR), impl/llm.ts throws and the suite fails closed — it
      # does not silently pass. A maintainer re-runs with the secret available.
```

- [ ] **Step 3: The user must add the GitHub secret** (out of band — cannot be done from code):
  `gh secret set ANTHROPIC_API_KEY --repo aabbottbos/agentic-sales-hub` (or via the repo Settings → Secrets UI). **Flag this as a required manual step in the PR description.**

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/evals.yml
git commit -m "ci(evals): ANTHROPIC_API_KEY for the call-summary rubric; fails closed when absent"
```

---

## Task 14: Docs + committed eval result

**Files:**
- Modify: `CLAUDE.md`, `HANDOFF.md`
- Add: `evals/results/<date>-<sha>.json` (from CI, or a local run with the key)

- [ ] **Step 1: `CLAUDE.md`** — under "Current state", add `call-summary` to the "what exists" list; under "Eval gates", add:

```markdown
- `call-summary` rubric aggregate ≥ **4.0/5** (LLM-judge, retry-median); citation validity = **1.00**; commitment recall ≥ **0.90**
```

Keep the file under ~150 lines — trim a stale line if needed (e.g. tighten the "Not yet built" list now that `call-summary` exists).

- [ ] **Step 2: `HANDOFF.md`** — update the intent-002 section: plan committed as `docs/plans/002-…`; implementation status; note the `gh secret set ANTHROPIC_API_KEY` manual step is done/pending; `call-summary` is the first LLM-backed impl and the seam held (or list what changed if a JC #1 seam item bit).

- [ ] **Step 3: Commit the eval result** — after the CI run on the PR produces `evals/results/<date>-<sha>.json` with the `call-summary` suite, commit it (or generate locally: `ANTHROPIC_API_KEY=... CI=true pnpm eval --suite all` writes it).

```bash
git add CLAUDE.md HANDOFF.md evals/results/
git commit -m "docs: call-summary gates in CLAUDE.md; HANDOFF + first generation eval result"
```

---

## Task 15: Full verification + PR

- [ ] **Step 1: Green the whole tree**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test              # all vitest projects; call-summary live block skipped without key
pnpm build
pnpm corpus:validate
pnpm check:no-real-data
pnpm skills:sync:check
```
All must pass.

- [ ] **Step 2: Full eval with the key**

```bash
ANTHROPIC_API_KEY=sk-... pnpm eval --suite all
```
Expected: `sow-review`, `find-evidence` gates unchanged (no net regression vs. `evals/results/2026-09-07-434b594.json`); `call-summary` all three gates PASS; `regression_verdict: PASS`.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin plan/002-call-summary-generation-path
gh pr create --title "feat: call-summary generation path (#7)" --body "<see below>"
```

PR body must include:
- Link to intent + spec + this plan.
- **Manual step:** `ANTHROPIC_API_KEY` must be set as a repo secret (`gh secret set ANTHROPIC_API_KEY`) or `evals.yml` fails closed.
- The JC #1 outcome: what additive changes landed in `runner.ts` / `run-suite.ts` and confirmation that `skill-def.schema.json`, `runSkill`'s signature, `CaseResult`/`SuiteResult`, and `context-core` are untouched.
- Eval result table (paste the `pnpm eval --suite all` output).
- Note that the rubric runs blocking on `evals.yml`'s critical path per spec OQ2.

- [ ] **Step 4: Watch `evals.yml`** on the PR — the eval comment must post with the `call-summary` suite and `regression_verdict: PASS`.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| `summary-output.json` output-contract schema | 2 |
| Not touching `artifact.json` | 2 (separate file), 3 (in-package validator) |
| Input = accumulating meeting note, not `inbound/**` | 4 (grant), 6 (reads via loader) |
| Provenance: every claim cited or `[unsourced]` | 5 (prompt), 2 (`unsourced_claims` required) |
| Citation validity deterministic = 1.00, resolve-only | 7 (`checkGenerationCitations`) |
| Skill definition (tier generation, one glob, `[context.read]`, no write) | 4 |
| `skill-def.schema.json` unchanged | 4 (verified — enum already has `generation`) |
| Security: live model call isolated behind one seam | 1 (`impl/llm.ts`) |
| Security: note body clearly delimited in the prompt | 5 (`<<<BEGIN MEETING NOTE>>>`) |
| Judge prompt/model/rubric committed + versioned | 9 |
| `generation.ts` `scoreCommitmentRecall` deterministic ≥ 0.90 | 8 |
| `judge.ts` `scoreRubric` ≥ 4.0/5, retry-median (3, median) | 9 |
| Golden set = 3 existing Acme notes, ≤ 2 more allowed | 10, 12 |
| `runGenerationSuite()` + `SuiteName`/`ALL_SUITES` additions | 11 |
| `runSkill` generation branch (contract extension, not signature) | 7 |
| `IMPLS`, `PRODUCT_SKILL_IDS`, `sync-claude-skills` filter gain `call-summary` | 4, 7 |
| Generated `.claude/skills/call-summary/SKILL.md`, `skills:check` green | 4 |
| `evals.yml` gains `ANTHROPIC_API_KEY`; fails closed for forks | 13 |
| No net regression vs. last committed result | 15 |
| `corpus:validate` / `check:no-real-data` / `gitleaks` green | 2, 12, 15 |
| Committed `call-summary` result in `evals/results/` | 14 |
| OQ5 resolved: no `context-core` change | 2 (auto-discovery), 3 (in-package validator), 7 (imports it) |
| OQ7 resolved: whole-file LF offsets | 5 (prompt basis), 6 (impl passes normalized raw) |
| OQ6: anchor calibration sequenced after skeleton impl | 12 (after 1–11) |

**Placeholder scan:** every code step has complete code. Task 12 is exploratory by necessity (spec OQ6) but its decision rules are concrete (thresholds, when to fix prompt vs. anchor, hard stop at 5 cases). Two spots flagged for an implementer decision with a stated default: sync vs. async `validateSummaryOutput` (default: sync) and the raw-file-text source in the impl (default: `ContextFile.absPath` + `readFile`).

**Type consistency:** `SummaryOutput` defined in Task 3 (`summary-schema.ts`), imported unchanged in Tasks 4 (type alias), 6 (impl return), 7 (`runner.ts`), 9 (`judge.ts`), 11 (suite). `complete()` / `CompleteArgs` defined in Task 1, used in 6, 9. `scoreCommitmentRecall` signature (`ProducedItems`, `LabeledCommitment`) defined in Task 8, called in 11. `scoreRubric(output, noteText, opts?)` defined in Task 9, called in 11. `CaseResult`/`SuiteResult` never change — verified against `run-suite.ts:44-57`.

**Pre-reads done during planning (no open items):** `ContextFile.raw` holds the LF-normalized whole file (`context-core/src/types.ts:69`) — Task 6 uses it directly. `skill-def.schema.json` already permits `tier: generation` + optional `write` + open `tools`. `loadSchemas` auto-discovers `context/schema/*.json` (`context-core/src/schema/load.ts:10`). `renderSkillMd` (`sync-claude-skills.ts:31`) is tier-agnostic bar one `review`-only line. `resolveCitation` offsets = whole-file LF (`resolve-citation.ts:12`). No `context-core` edit anywhere in this plan.

---

## Verification (end to end)

1. **Unit (no network):** `pnpm vitest --project skills` and `pnpm vitest --project evals` — all green, `call-summary` impl + runner branch + scorers covered with `complete()` stubbed.
2. **Schema:** `pnpm corpus:validate` — `summary-output.json` compiles; any new notes validate.
3. **Skill drift:** `pnpm skills:sync:check` — `.claude/skills/call-summary/SKILL.md` in sync.
4. **Live skill run:** `ANTHROPIC_API_KEY=... pnpm eval --suite call-summary --no-compare` — table shows all three metrics per case; gates PASS.
5. **No regression:** `ANTHROPIC_API_KEY=... pnpm eval --suite all` — `regression_verdict: PASS`; `sow-review` / `find-evidence` aggregates unchanged.
6. **CI:** on the PR, `evals.yml` runs green and posts the eval comment including the `call-summary` suite. (Requires the `ANTHROPIC_API_KEY` repo secret — manual step in Task 13.)
7. **Seam claim:** `git diff main -- packages/skills/src/skill-def.schema.json packages/context-core/` is **empty**; `git diff main -- packages/skills/src/runner.ts` shows only an added `IMPLS` entry + an added `else if` branch; `runSkill`'s signature line is unchanged.
