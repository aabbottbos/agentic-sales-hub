# 004 — call-prep + the write path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Context

Intent 002 / plan 002 shipped `call-summary` but explicitly deferred persistence: "a separate step (WI-2) persists it." That step is this plan. WI-1 (intent 003, tenancy seam) shipped first — `resolveContextRoot()` / `resolveContextPath()` exist and every new write-path function must run through them, never a hardcoded `context/` prefix.

Two things ship together because the second has no caller without the first: `writeArtifact()` (the only sanctioned way to create a file under `context/accounts/*/opportunities/*/artifacts/**`) and `call-prep` (the second LLM-backed generation-tier skill, `writeArtifact()`'s first real caller). `protect-paths` is extended so the write path is the *only* path to `artifacts/**`, not merely the encouraged one, and `runSkill`'s citation-checking logic — currently hardcoded to `call-summary`'s exact field names — is generalized so a second (and future third) generation skill doesn't need its own hardcoded branch.

Intent: `docs/intent/004-call-prep-write-path.md` (committed). Spec: `docs/specs/004-call-prep-write-path.md` (committed, reviewed, all judgment calls ratified). This plan is the Build-stage artifact — committed as `docs/plans/004-call-prep-write-path.md` **before any code**, per framework §3.

## Decisions locked before this plan (spec + ratified judgment calls — do not reopen)

| # | Decision |
|---|---|
| JC1 | `brief-output.json` is a new output-contract schema, sectioned `goal`/`what_we_know`/`talking_points`/`risks`, reusing `summary-output.json`'s citation/`[unsourced]` machinery. No `owner` field (a brief has no counterparty commitments yet). |
| JC2 | Citation shape is `{path, quote, span}` — model returns `quote`, skill computes `span` by locating it in the source file (carries forward intent 002 amendment A2: models cannot produce reliable byte offsets). |
| JC3 | `outcome-record.json` **is** `context/schema/outcome.json`. No new file, no rename — ratified at spec review. |
| JC4 | Read grant is wide (whole opportunity subtree + account + all canonical context, minus `context/legal/**`) — justified against the pre-existing `a-0001-brief.md` fixture's actual citations. |
| JC5 | `runSkill`'s generation branch gets a **real generalization**, not a call-prep-shaped patch — ratified at spec review: walk the validated output object for every array field whose items carry a `citation` (or are themselves `{path, quote, span}`-shaped), flatten, run `resolveCitation` over the union. Must fail closed (throw) on an unwalkable shape, never silently produce an empty set — except a legitimately citation-free (`unsourced_claims`-only) output must NOT throw; see Task 8. |
| JC6 | `call-prep`'s rubric gate ships **advisory only** — ratified at spec review, held off deliberately, tracked as a standing decision to revisit (`HANDOFF.md` "Open follow-ups" #8), not closed. Extends intent 002 amendment A1 to a second generation skill without re-running calibration. |
| JC7 | The write grant lives on the skill *definition* even though the skill *impl* never calls `writeArtifact()` — `runSkill` does, after the impl returns, mirroring how `sow-review` findings are persisted by a separate step. |
| JC8 | Artifact id scheme: **sequential `a-000N`, zero-padded to 4 digits**, minted by listing the existing `artifacts/` directory at write time, retried under `wx`-collision (bounded retry). Matches the pre-existing `a-0001`/`a-0002` fixture convention — **not** `write-findings.ts`'s timestamp-suffix scheme. |
| JC9 | Eval-harness mutation: `pnpm eval --suite call-prep` calls `writeArtifact()` for real against a **scratch copy of the corpus** (mkdtemp + cp, `write-findings.test.ts`'s `tempCorpus()` pattern), never against `examples/demo-corpus/` directly. **No dry-run mode on `writeArtifact()` itself.** |
| OQ5 | `writeArtifact()`'s template check is a **real, always-no-op-when-absent call site** — confirmed at this plan's review against the committed spec text ("the template check exists as a call site... but is a no-op... when no org template is present"). `checkOutputTemplate()` looks for `context/org/templates/<kind>.md` and unconditionally returns `{valid: true}` when absent. WI-5 later changes only the *body* of that function, not `writeArtifact()`'s signature. |
| Models | Skill call: `claude-sonnet-5`, via the existing `impl/llm.ts` seam (reused, not duplicated). No new judge model. |

**Seam claim this plan must hold (verified in Task 15):** `skill-def.schema.json` is untouched (already permits `tier: generation`, optional `write`, an open `tools` array). `SkillImpl` interface and `runSkill`'s parameter list/return-type shape are untouched — every change is an additive branch or field, the same class of change intent 002's Judgment call #1 already established the seam can absorb. `context-core/src/types.ts` **does** gain new additive exports (`WriteArtifactArgs`, `WriteArtifactResult`) — call this out explicitly in the PR, it is a real (if small) difference from plan 002's "zero context-core diff" claim.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `context/schema/brief-output.json` | Output-contract JSON Schema for `call-prep`'s in-memory return. Auto-discovered by `loadSchemas`, **not** added to `context-core`'s `SCHEMA_TYPES` (mirrors `summary-output.json` — validated in-package, continuing intent 002 OQ5's precedent). |
| `packages/context-core/src/write-path.ts` | `writeArtifact()` — the sanctioned artifact-creation function. |
| `packages/context-core/src/write-path.test.ts` | Unit tests: id-minting + collision retry, template no-op, auto-open outcome, re-validation against `artifact.json`. |
| `packages/skills/src/definitions/call-prep.yaml` | The skill definition (data). |
| `packages/skills/src/impl/brief-schema.ts` | Compiles `brief-output.json` once with ajv2020 (mirrors `summary-schema.ts` exactly). |
| `packages/skills/src/impl/citation-span.ts` | **Extracted shared helper** — `resolveCitationSpan(raw, cit)` moved out of `call-summary.ts` verbatim (tiered exact → whitespace-insensitive → punctuation-unified → longest-verbatim-run matching). Both `call-summary.ts` and `call-prep.ts` import it. |
| `packages/skills/src/impl/call-prep.ts` | The generation impl — mirrors `call-summary.ts`'s shape. |
| `packages/skills/src/impl/call-prep.prompt.ts` | System + user prompt templates. |
| `packages/skills/src/impl/call-prep.test.ts` | Unit tests for the impl, `complete` stubbed. |
| `.claude/hooks/protect-paths.test.ts` | New — direct hook-level tests (none currently exist for this hook; the injection harness exercises `quarantine-inbound.ts`, not this one). |
| `.claude/skills/call-prep/SKILL.md` | **Generated** by `pnpm skills:sync`. Committed, never hand-edited. |
| `evals/cases/call-prep/acme-prep.case.json` | Case against the existing Acme opportunity. No `expected_*_ref` — citation validity (blocking) + rubric (advisory) are the two metrics; no deterministic recall scorer ships this slice. |
| `evals/judge/call-prep-rubric.md`, `evals/judge/call-prep-judge-prompt.md` | Rubric dimensions + judge prompt for `call-prep` (advisory only, JC6). |

### Modified files

| Path | Change |
|---|---|
| `packages/context-core/src/types.ts` | Add `WriteArtifactArgs`, `WriteArtifactResult`, `ArtifactCitationInput`. |
| `packages/context-core/src/loader.ts` | Add `writeArtifact` to `ContextLoader` + `createLoader()`, same shape as `writeFindings`/`appendOutcome`. |
| `packages/context-core/src/index.ts` | Export `writeArtifact` and its types. |
| `packages/skills/src/impl/call-summary.ts` | Replace inline `resolveCitationSpan`/`unify`/`RawCitation` with an import from `./citation-span.js`. Pure extraction, no behavior change. |
| `packages/skills/src/types.ts` | Add `"call-prep"` to `PRODUCT_SKILL_IDS`; add `artifactPath?: string` to `SkillRunResult`. |
| `packages/skills/src/runner.ts` | Register `callPrepImpl`; replace `checkGenerationCitations`/`SummaryLike` with a generalized citation-flattening walker (JC5); add a post-validation `writeArtifact()` call for generation-tier skills with a write grant. |
| `.claude/hooks/protect-paths.ts` | Add a `PROTECTED_WRITE` pattern for `**/artifacts/**` under both roots. |
| `evals/runner/run-suite.ts` | Add `"call-prep"` to `SuiteName`/`ALL_SUITES`; add `runCallPrepSuite()` using a **scratch-corpus loader** per run, never the shared `examples/demo-corpus/` root. |
| `evals/runner/compare.ts` | Add `"call-prep": ["citation_validity"]` to `PRIMARY`. |
| `evals/runner/cli.ts` | Update usage string to include `call-prep`. |
| `evals/judge/judge.ts` | Generalize `scoreRubric` to accept an optional `{rubricFile, promptFile}` pair (default: the existing `call-summary` files — zero behavior change at the existing call site). |
| `context/schema/README.md` | Add `brief-output.json` to the output-contract-schemas note. |
| `CLAUDE.md` | Add `call-prep` to "what exists"; note the write path exists; note the advisory-only gate matches `call-summary`'s. |
| `HANDOFF.md` | Mark WI-2/intent-004 row done; add a "shipped" section; note the seam claim (incl. the `types.ts` deviation). |
| `evals/results/<date>-<sha>.json` | New committed result including the `call-prep` suite. |

---

## Task 1: `writeArtifact()` in context-core

**Files:** create `write-path.ts` + `write-path.test.ts`; modify `types.ts`, `loader.ts`, `index.ts`.

Foundational — everything else depends on `ctx.loader.writeArtifact` existing.

- [ ] **Step 1: Add `WriteArtifactArgs`/`WriteArtifactResult`/`ArtifactCitationInput` to `types.ts`**, adjacent to `WriteFindingsArgs`:

```ts
export interface ArtifactCitationInput {
  /** The claim this citation supports — becomes citations[].claim in the artifact frontmatter. */
  claim: string;
  path: string;
  span: Span;
}

export interface WriteArtifactArgs {
  accountSlug: string;
  crmId: string;
  /** e.g. "brief" — must be in artifact.json's kind enum. */
  kind: string;
  /** The skill id that produced this — becomes generated_by. */
  generatedBy: string;
  title: string;
  /** Rendered markdown body (post-frontmatter). The caller (runSkill) renders
   *  the structured output into prose; writeArtifact does not know skill-specific shape. */
  body: string;
  citations: ArtifactCitationInput[];
  unsourcedClaims?: string[];
  /** Explicit artifact id (deterministic tests); auto-minted if omitted. */
  artifactId?: string;
}

export interface WriteArtifactResult {
  artifactPath: string;
  artifactId: string;
}
```

- [ ] **Step 2: Write the failing tests** in `packages/context-core/src/write-path.test.ts`, reusing `write-findings.test.ts`'s exact `tempCorpus()` helper (mkdtemp + `cp` of `test/fixtures/`). Cases:
  - writes a valid artifact that re-validates against `artifact.json` (`kind`, `generated_by`, `superseded: false` all correct)
  - mints the next sequential id when `a-0001-brief.md` already exists in the fixture (confirm the fixture already seeds this — it does, `test/fixtures/context/accounts/fix-co/opportunities/.../artifacts/a-0001-brief.md`)
  - auto-opens an `unused` outcome record for the new artifact path
  - rejects an unknown `kind` with `SchemaValidationError`
  - an explicit `artifactId` collision throws `AppendOnlyViolationError` (never overwrites)
  - 5 concurrent `writeArtifact()` calls (no explicit id) via `Promise.all` mint 5 distinct ids — proves the `EEXIST`-retry path actually engages under a real race
  - succeeds with no `context/org/templates/` directory present at all (the template no-op path)

- [ ] **Step 3:** `pnpm vitest run packages/context-core/src/write-path.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Implement `write-path.ts`**:

```ts
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { assertAppendOnly } from "./fs/append-only.js";
import { validateAgainst } from "./schema/validate.js";
import type { SchemaRegistry } from "./schema/registry.js";
import { AppendOnlyViolationError, SchemaValidationError } from "./errors.js";
import { SCHEMA_VERSION } from "./schema/registry.js";
import { resolveContextPath } from "./fs/resolve-path.js";
import { appendOutcome } from "./outcomes/append-outcome.js";
import type { WriteArtifactArgs, WriteArtifactResult } from "./types.js";

export interface WriteArtifactDeps {
  root: string;
  registry: SchemaRegistry;
  now?: () => Date;
}

const MAX_MINT_ATTEMPTS = 8;

/**
 * Persist a generation skill's structured output as a new `kind: <kind>`
 * artifact under the opportunity. The ONLY sanctioned way to create a file
 * under `context/accounts/*/opportunities/*/artifacts/**` — runSkill calls
 * this after validating a generation-tier skill's output; the skill impl
 * never writes (spec 004 JC7).
 *
 * - Mints a sequential `a-000N` id by listing artifacts/ (JC8); the actual
 *   collision guard is `flag: "wx"` plus a bounded retry on EEXIST, not the
 *   id scheme being unguessable.
 * - Validates the rendered frontmatter against artifact.json before writing.
 * - Checks for an org output template (context/org/templates/<kind>.md); a
 *   no-op returning {valid:true} when absent — enforcement logic beyond
 *   presence-check is WI-5 (spec 004 OQ5).
 * - Auto-opens an `unused` outcome record via appendOutcome() on success.
 */
export async function writeArtifact(
  args: WriteArtifactArgs,
  deps: WriteArtifactDeps,
): Promise<WriteArtifactResult> {
  const now = deps.now ? deps.now() : new Date();
  const oppDir = `context/accounts/${args.accountSlug}/opportunities/${args.crmId}`;
  const artifactsDir = `${oppDir}/artifacts`;

  const templateCheck = checkOutputTemplate(deps.root, args.kind);
  if (!templateCheck.valid) {
    throw new SchemaValidationError(`${artifactsDir}/<new>`, "output-template", templateCheck.errors);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const artifactId = args.artifactId ?? (await mintNextId(deps.root, artifactsDir));
    const relPath = `${artifactsDir}/${artifactId}-${args.kind}.md`;

    const frontmatter = buildFrontmatter({ ...args, artifactId, created: now.toISOString() });
    const res = validateAgainst(deps.registry, "artifact", frontmatter);
    if (!res.valid) throw new SchemaValidationError(relPath, "artifact", res.issues);

    assertAppendOnly(relPath, "create");
    const absPath = resolveContextPath(relPath, deps.root);
    const content = renderArtifact({ ...args, artifactId, created: now.toISOString() });

    try {
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, { encoding: "utf8", flag: "wx" });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        if (args.artifactId) {
          throw new AppendOnlyViolationError(
            relPath, "create", "an artifact already exists at this explicit artifact id",
          );
        }
        lastErr = e;
        continue; // re-list, re-mint, re-attempt
      }
      throw e;
    }

    await appendOutcome(
      {
        accountSlug: args.accountSlug,
        crmId: args.crmId,
        artifact: relPath,
        outcome: "unused",
        date: now.toISOString().slice(0, 10),
      },
      { root: deps.root, registry: deps.registry },
    );

    return { artifactPath: relPath, artifactId };
  }
  throw new AppendOnlyViolationError(
    artifactsDir, "create",
    `could not mint a collision-free artifact id after ${MAX_MINT_ATTEMPTS} attempts: ${(lastErr as Error)?.message ?? "unknown"}`,
  );
}

/** List artifacts/ and return the next sequential a-000N id (4-digit, zero-padded). */
async function mintNextId(root: string, artifactsDirLogical: string): Promise<string> {
  const absDir = resolveContextPath(artifactsDirLogical, root);
  let entries: string[] = [];
  try {
    entries = await readdir(absDir);
  } catch {
    entries = []; // directory doesn't exist yet — first artifact
  }
  let max = 0;
  for (const e of entries) {
    const m = /^a-(\d{4,})-/.exec(e);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `a-${String(max + 1).padStart(4, "0")}`;
}

/** Presence-check only. Returns {valid:true} unconditionally when no template
 *  file exists. Enforcement logic (parsing required sections out of the
 *  template, checking the rendered body against them) is WI-5. */
function checkOutputTemplate(root: string, kind: string): { valid: boolean; errors: string[] } {
  const templatePath = resolveContextPath(`context/org/templates/${kind}.md`, root);
  if (!existsSync(templatePath)) return { valid: true, errors: [] };
  return { valid: true, errors: [] }; // template exists but is not yet enforced — WI-5
}

interface RenderArgs extends WriteArtifactArgs { artifactId: string; created: string }

function buildFrontmatter(a: RenderArgs): Record<string, unknown> {
  return {
    fictional: true,
    mutability: "accumulating",
    schema_version: SCHEMA_VERSION,
    created: a.created,
    title: a.title,
    artifact_id: a.artifactId,
    kind: a.kind,
    generated_by: a.generatedBy,
    superseded: false,
    citations: a.citations.map((c) => ({ claim: c.claim, path: c.path, span: c.span })),
    ...(a.unsourcedClaims?.length ? { unsourced_claims: a.unsourcedClaims } : {}),
  };
}

function renderArtifact(a: RenderArgs): string {
  const fm = buildFrontmatter(a);
  const lines = [
    "---",
    `fictional: ${fm.fictional}`,
    `mutability: ${fm.mutability}`,
    `schema_version: "${fm.schema_version}"`,
    `created: "${fm.created}"`,
    `title: "${(fm.title as string).replaceAll('"', '\\"')}"`,
    `artifact_id: ${fm.artifact_id}`,
    `kind: ${fm.kind}`,
    `generated_by: ${fm.generated_by}`,
    `superseded: false`,
    "citations:",
    ...a.citations.map(
      (c) => `  - claim: ${JSON.stringify(c.claim)}\n    path: ${c.path}\n    span: [${c.span[0]}, ${c.span[1]}]`,
    ),
    ...(a.unsourcedClaims?.length
      ? ["unsourced_claims:", ...a.unsourcedClaims.map((s) => `  - ${JSON.stringify(s)}`)]
      : []),
    "---",
    "",
  ];
  return lines.join("\n") + a.body;
}
```

Note: hand-built YAML lines match `write-findings.ts`'s existing precedent exactly (no YAML serializer library is used there either) — verified to round-trip through `readContextFile` in the Step 2 tests.

- [ ] **Step 5: Wire into `loader.ts`** — add `writeArtifact` to the `ContextLoader` interface and to `createLoader()`'s returned object, alongside `writeFindings`/`appendOutcome`:

```ts
    writeArtifact: (args) =>
      writeArtifact(args, { root, registry, ...(opts.now ? { now: opts.now } : {}) }),
```

- [ ] **Step 6: Export from `index.ts`**: `writeArtifact`, `WriteArtifactArgs`, `WriteArtifactResult`, `ArtifactCitationInput`.

- [ ] **Step 7:** `pnpm vitest run packages/context-core/src/write-path.test.ts` — expect PASS, all cases including the concurrent-mint race.

- [ ] **Step 8:**
```bash
pnpm typecheck
pnpm vitest run --project context-core
git add packages/context-core/src/write-path.ts packages/context-core/src/write-path.test.ts packages/context-core/src/types.ts packages/context-core/src/loader.ts packages/context-core/src/index.ts
git commit -m "feat(context-core): writeArtifact() — the sanctioned artifacts/ write path"
```

---

## Task 2: Extend `protect-paths` to deny direct writes to `**/artifacts/**`

**Files:** modify `.claude/hooks/protect-paths.ts`; create `.claude/hooks/protect-paths.test.ts`.

Independent of Task 1/3 — ships the enforcement boundary early.

- [ ] **Step 1:** Confirm no existing direct unit test for this hook (search `.claude/hooks` for `*.test.ts`) — the injection harness exercises `quarantine-inbound.ts`, not `protect-paths.ts`.

- [ ] **Step 2: Write the failing test** — invoke the hook as a subprocess using Node's `child_process` module's argument-array form (the hook path plus a runtime like `tsx` as separate array elements, never a concatenated shell string), piping the JSON `{tool_name, tool_input}` payload on stdin exactly as the hook's own `readStdin()` expects. Assert exit code 2 plus a stderr message mentioning `writeArtifact`/`artifacts` for:
  - a direct `Write` to `context/accounts/*/opportunities/*/artifacts/*.md`
  - a direct `Edit` to the `examples/demo-corpus/` dual-root equivalent
  - and exit code 0 (not blocked) for a `Write` to `meetings/**` (control case, proves the new pattern is scoped correctly)

- [ ] **Step 3:** `pnpm vitest run .claude/hooks/protect-paths.test.ts` — expect FAIL on the two blocking cases.

- [ ] **Step 4:** Add to `PROTECTED_WRITE` in `protect-paths.ts`:

```ts
  // Artifacts under an opportunity are created ONLY through writeArtifact()
  // (spec 004) — never a direct Write/Edit/MultiEdit. Matches both roots
  // (tenancy seam, WI-1): the logical context/ root and examples/demo-corpus/.
  /(?:^context|^examples\/demo-corpus)\/accounts\/[^/]+\/opportunities\/[^/]+\/artifacts\//,
```

Update the file's top-of-file doc comment to mention the new rule.

- [ ] **Step 5:** `pnpm vitest run .claude/hooks/protect-paths.test.ts` — expect PASS.

- [ ] **Step 6:**
```bash
pnpm typecheck
git add .claude/hooks/protect-paths.ts .claude/hooks/protect-paths.test.ts
git commit -m "feat(hooks): protect-paths blocks direct writes to artifacts/ — writeArtifact() is the only path"
```

---

## Task 3: `brief-output.json` schema + in-package validator

**Files:** create `context/schema/brief-output.json`, `packages/skills/src/impl/brief-schema.ts`; modify `context/schema/README.md`; create `packages/skills/src/impl/call-prep.test.ts` (grows through Tasks 3–6).

- [ ] **Step 1: Write the schema** — pin the spec's draft exactly:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-sales-hub.dev/schema/brief-output.json",
  "title": "Call-prep brief (call-prep output contract)",
  "description": "OUTPUT-CONTRACT schema: validates the call-prep skill's structured return, not a file on disk.",
  "type": "object",
  "properties": {
    "goal": { "type": "string", "minLength": 1 },
    "what_we_know": { "type": "array", "items": { "$ref": "#/$defs/item" } },
    "talking_points": { "type": "array", "items": { "$ref": "#/$defs/item" } },
    "risks": { "type": "array", "items": { "$ref": "#/$defs/item" } },
    "citations": { "type": "array", "items": { "$ref": "#/$defs/citation" } },
    "unsourced_claims": { "type": "array", "items": { "type": "string", "minLength": 1 } }
  },
  "required": ["goal", "what_we_know", "talking_points", "risks", "citations", "unsourced_claims"],
  "additionalProperties": false,
  "$defs": {
    "item": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "minLength": 1 },
        "citation": { "$ref": "#/$defs/citation" }
      },
      "required": ["text", "citation"],
      "additionalProperties": false
    },
    "citation": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "quote": { "type": "string", "minLength": 1 },
        "span": {
          "type": "array",
          "prefixItems": [{ "type": "integer", "minimum": 0 }, { "type": "integer", "minimum": 0 }],
          "minItems": 2, "maxItems": 2
        }
      },
      "required": ["path", "quote", "span"],
      "additionalProperties": false
    }
  }
}
```

Field names cross-checked against `a-0001-brief.md`'s actual body sections: "Goal of this call" → `goal`; "What we know" → `what_we_know`; "Talking points" → `talking_points`; "Risks" → `risks`.

- [ ] **Step 2:** `pnpm vitest run packages/context-core/src/schema/registry.test.ts` — PASS unchanged; `brief-output.json` is **not** added to `SCHEMA_TYPES` (same precedent as `summary-output.json`).

- [ ] **Step 3:** Update `context/schema/README.md`'s output-contract-schemas note to list `brief-output.json`.

- [ ] **Step 4:** `pnpm corpus:validate` — PASS.

- [ ] **Step 5: Write the failing validator tests** in `call-prep.test.ts`: accepts a well-formed output; rejects an unknown top-level key; rejects a `what_we_know` item missing `citation`; rejects a missing `unsourced_claims` key; rejects a citation missing `quote` (JC2 — span alone is not enough).

- [ ] **Step 6:** `pnpm vitest run packages/skills/src/impl/call-prep.test.ts` — expect FAIL (module not found).

- [ ] **Step 7: Implement `brief-schema.ts`**, mirroring `summary-schema.ts` exactly (same repo-root walk-up via `pnpm-workspace.yaml`, same sync `readFileSync` + ajv2020 compile-once pattern, exporting `validateBriefOutput(value): {valid, errors}` and the `BriefOutput`/`BriefCitation`/`BriefItem` types).

- [ ] **Step 8:**
```bash
pnpm vitest run packages/skills/src/impl/call-prep.test.ts
pnpm typecheck
git add context/schema/brief-output.json context/schema/README.md packages/skills/src/impl/brief-schema.ts packages/skills/src/impl/call-prep.test.ts
git commit -m "feat(schema): brief-output.json + in-package validator for call-prep"
```

---

## Task 4: Extract `resolveCitationSpan` to a shared helper

**Files:** create `packages/skills/src/impl/citation-span.ts`; modify `call-summary.ts`.

Do this **before** `call-prep.ts` so the new skill imports the shared version from day one.

- [ ] **Step 1:** Move `unify()`, `resolveCitationSpan()`, and the `RawCitation` interface out of `call-summary.ts` verbatim (all four matching tiers: exact → whitespace-insensitive → punctuation-unified → longest-verbatim-run ≥16 chars) into `citation-span.ts`, exporting `RawCitation`, `ResolvedSpanCitation`, `unify`, `resolveCitationSpan`.

- [ ] **Step 2:** Update `call-summary.ts` to import `resolveCitationSpan` and `RawCitation` from `./citation-span.js`; remove the inline definitions. No other change — `fixCitations`'s call sites are untouched.

- [ ] **Step 3:** `pnpm vitest run packages/skills/src/impl/call-summary.test.ts` — expect PASS, unchanged (pure extraction, identical runtime behavior).

- [ ] **Step 4:**
```bash
pnpm typecheck
git add packages/skills/src/impl/citation-span.ts packages/skills/src/impl/call-summary.ts
git commit -m "refactor(skills): extract resolveCitationSpan to a shared helper (citation-span.ts)"
```

---

## Task 5: `call-prep.yaml` skill definition

**Files:** create `packages/skills/src/definitions/call-prep.yaml`; modify `packages/skills/src/types.ts`, `skills.test.ts`.

- [ ] **Step 1: Write the failing test** in `skills.test.ts` — `listSkills()` returns all four ids including `call-prep`; `loadSkill("call-prep")` has `tier: "generation"`, the exact 7-glob read grant, the 1-glob write grant, `tools: ["context.read", "artifact.write"]`, `output.schema` = `context/schema/brief-output.json`, `requires_citations: true`, and the read grant contains no `legal` glob.

- [ ] **Step 2:** `pnpm vitest run packages/skills/src/skills.test.ts -t call-prep` — expect FAIL (unknown skill).

- [ ] **Step 3: Write the definition** — pin the spec's draft exactly:

```yaml
id: call-prep
tier: generation
version: 1
description: >-
  Prepare a call-prep brief for an upcoming meeting on one opportunity —
  goal, what we know, talking points, and risks, each citing the meeting
  notes, org evidence, opportunity record, or prior artifacts that support
  it. Claims with no source are marked [unsourced], never asserted. Output
  is persisted as a new artifact through writeArtifact(); an outcome record
  opens automatically as unused.
context_grants:
  read:
    - context/accounts/{account}/opportunities/{opp}/meetings/**
    - context/accounts/{account}/opportunities/{opp}/opportunity.md
    - context/accounts/{account}/opportunities/{opp}/artifacts/**
    - context/accounts/{account}/account.md
    - context/accounts/{account}/people/**
    - context/org/**
    - context/demand-gen/**
  write:
    - context/accounts/{account}/opportunities/{opp}/artifacts/**
inputs:
  account_slug:
    type: string
    required: true
  opp_id:
    type: string
    required: true
  meeting_context:
    type: string
    required: false
output:
  schema: context/schema/brief-output.json
  requires_citations: true
eval_suite: evals/cases/call-prep/
tools:
  - context.read
  - artifact.write
```

`{account}`/`{opp}` placeholders are already supported by `resolveScope`'s `substitute()` — no scope-resolution code change needed.

- [ ] **Step 4: Add `"call-prep"` to `PRODUCT_SKILL_IDS`** in `packages/skills/src/types.ts`.

- [ ] **Step 5:** `pnpm vitest run packages/skills/src/skills.test.ts -t call-prep` — expect PASS.

- [ ] **Step 6:** `pnpm skills:sync` to generate `.claude/skills/call-prep/SKILL.md`; `pnpm skills:check` confirms no drift.

- [ ] **Step 7:**
```bash
pnpm typecheck
git add packages/skills/src/definitions/call-prep.yaml packages/skills/src/types.ts packages/skills/src/skills.test.ts .claude/skills/call-prep/
git commit -m "feat(skills): call-prep.yaml — wide read grant, first generation skill with a write grant"
```

---

## Task 6: `call-prep.prompt.ts`

**Files:** create `packages/skills/src/impl/call-prep.prompt.ts`.

- [ ] **Step 1:** Mirror `call-summary.prompt.ts`'s shape — `buildSystemPrompt()` (fixed instructions: cite every material claim as `{path, quote}`, use exact verbatim substrings for `quote`, mark unsupported claims in `unsourced_claims` rather than asserting them, output bare JSON matching the `brief-output.json` contract, sectioned goal/what_we_know/talking_points/risks) and `buildUserPrompt(accountSlug, oppId, meetingContext, contextFiles: {path, raw}[])` (concatenates every in-scope file with a delimited-file marker per file, since `call-prep` synthesizes across many files, not one note like `call-summary`).

- [ ] **Step 2:**
```bash
pnpm typecheck
git add packages/skills/src/impl/call-prep.prompt.ts
git commit -m "feat(skills): call-prep prompt templates"
```

---

## Task 7: `call-prep.ts` impl

**Files:** create `packages/skills/src/impl/call-prep.ts`; extend `call-prep.test.ts`.

- [ ] **Step 1: Write the failing tests** — `complete()` stubbed via `vi.spyOn`: happy path returns a valid `BriefOutput` with `scopeResolved`/`contextRead` covering the full multi-glob scope; retries up to 3 attempts on invalid/unparseable JSON then throws with a clear message; a citation `quote` not found verbatim in any read file gets an out-of-range span (via `resolveCitationSpan`, shared helper from Task 4) rather than crashing.

- [ ] **Step 2:** `pnpm vitest run packages/skills/src/impl/call-prep.test.ts` — expect FAIL.

- [ ] **Step 3: Implement `call-prep.ts`**, mirroring `call-summary.ts`'s structure:
  - `ctx.loader.resolveScope(def.context_grants, {...ctx.scopeParams, accountSlug, oppId})` — no `documentPath` anchor (unlike `call-summary`, the grant is multi-glob, not single-document).
  - Read every file in `scopeResolved` via `ctx.loader.read(path)`, collecting `{path, raw}[]`.
  - Build the prompt via `call-prep.prompt.ts`, call `complete()` from `impl/llm.ts` (the existing seam — reused, not duplicated), same `MAX_TOKENS`/retry-on-malformed-output pattern as `call-summary.ts` (`MAX_GEN_ATTEMPTS = 3`).
  - Fix citations: for every `what_we_know`/`talking_points`/`risks`/`citations` entry, resolve `{path, quote}` → `{path, quote, span}` via the shared `resolveCitationSpan`, matched against the specific source file's raw content (not a single note — `call-prep` must look up the right file by the citation's own `path`).
  - Return `{output, scopeResolved, contextRead: scopeResolved, trace}` — `contextRead` equals the full resolved scope since the impl genuinely reads everything into one prompt (unlike `call-summary`'s single-document anchor).

- [ ] **Step 4:**
```bash
pnpm vitest run packages/skills/src/impl/call-prep.test.ts
pnpm typecheck
git add packages/skills/src/impl/call-prep.ts packages/skills/src/impl/call-prep.test.ts
git commit -m "feat(skills): call-prep impl — wide-scope read, model call behind the seam, brief-output validation"
```

---

## Task 8: Generalize `runSkill`'s citation-flattening (JC5) + wire `call-prep` in

**Files:** modify `packages/skills/src/runner.ts`, `types.ts`, `skills.test.ts`.

Highest-risk task in the plan. Two sub-parts: the generalized walker (testable standalone), then the `IMPLS`/`writeArtifact()` wiring.

- [ ] **Step 1: Write the failing tests for the walker** (export `flattenCitations` from `runner.ts` for direct testability):
  - flattens `call-summary`-shaped output (citation nested under `commitments`/`next_steps`/`context_deltas`, plus a bare top-level `citations[]`)
  - flattens `call-prep`-shaped output (citation nested under `what_we_know`/`talking_points`/`risks`)
  - de-duplicates the same `{path, span}` cited from multiple fields
  - **does not throw** on a legitimately citation-free output (`citations: []`, every item array `[]`, `unsourced_claims: ["x"]`) — returns `[]`
  - **throws** on an object with no `citations` array field at all and no array-of-cited-items field either (structurally unwalkable)
  - **throws** when an item's `.citation` property exists but is malformed (missing `span`) — a schema/runner-assumption mismatch, not a model error, must surface loudly
  - ignores non-citation array fields (e.g. `unsourced_claims: string[]`) without throwing

- [ ] **Step 2:** `pnpm vitest run packages/skills/src/skills.test.ts -t flattenCitations` — expect FAIL.

- [ ] **Step 3: Implement the generalized walker**, replacing `SummaryLike`/`checkGenerationCitations`:

```ts
interface CitationRef { path: string; span: [number, number]; quote?: string }

function isCitationShaped(v: unknown): v is CitationRef {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.path === "string" &&
    Array.isArray(o.span) && o.span.length === 2 &&
    typeof o.span[0] === "number" && typeof o.span[1] === "number"
  );
}

function citationKey(c: CitationRef): string {
  return `${c.path}::${c.span[0]}::${c.span[1]}`;
}

/**
 * Generalized citation-flattening for any generation-tier output that already
 * passed its own output-contract schema validation (spec 004 JC5). Walks
 * every own enumerable property of `output`:
 *   - an array field is a "citation carrier" if it is `citations` by name
 *     (the one field every generation output-contract schema requires,
 *     possibly empty), OR any of its items are citation-shaped directly, OR
 *     any of its items carry a citation-shaped `.citation` property.
 *   - a non-array property, or an array of plain strings (e.g.
 *     `unsourced_claims`), is silently skipped.
 *
 * FAILS CLOSED: if NO array field is recognized as a citation carrier at all
 * (not even an empty, correctly-named `citations` field), throws — a
 * schema-valid-but-structurally-unwalkable output is a runner assertion
 * failure, not a silent empty set. Likewise an item whose `.citation`
 * property exists but is malformed throws rather than being skipped, since
 * schema validation should already have caught that shape.
 *
 * A legitimately citation-free output (every claim marked [unsourced], so
 * every item array and the top-level `citations` are empty) does NOT throw:
 * the presence of the `citations` key as an array, empty or not, is itself
 * sufficient evidence of a walkable shape.
 */
function flattenCitations(output: unknown): CitationRef[] {
  if (typeof output !== "object" || output === null) {
    throw new Error("flattenCitations: output is not an object");
  }
  const record = output as Record<string, unknown>;
  const seen = new Map<string, CitationRef>();
  let foundCarrierField = Array.isArray(record.citations);

  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      if (isCitationShaped(item)) {
        foundCarrierField = true;
        seen.set(citationKey(item), item);
        continue;
      }
      if (typeof item === "object" && item !== null && "citation" in item) {
        const c = (item as { citation: unknown }).citation;
        if (!isCitationShaped(c)) {
          throw new Error(
            `flattenCitations: field "${key}" has an item with a malformed .citation ` +
              `(expected {path: string, span: [number, number]}) after output already ` +
              `passed schema validation — this is a runner/schema mismatch, not a model error`,
          );
        }
        foundCarrierField = true;
        seen.set(citationKey(c), c);
      }
      // else: a plain array item (e.g. a string in unsourced_claims) — skip.
    }
  }

  if (!foundCarrierField) {
    throw new Error(
      "flattenCitations: found no citation-shaped field anywhere in output " +
        "(no top-level citations[] array and no array items carrying a .citation) — " +
        "refusing to report an empty citation set as valid",
    );
  }

  return [...seen.values()];
}

export { flattenCitations };

/** Generation citation validity = resolve-only over the flattened citation set. */
async function checkGenerationCitations(ctx: RunContext, output: unknown): Promise<boolean> {
  for (const c of flattenCitations(output)) {
    try {
      await ctx.loader.resolveCitation({ path: c.path, span: c.span });
    } catch {
      return false;
    }
  }
  return true;
}
```

- [ ] **Step 4:** `pnpm vitest run packages/skills/src/skills.test.ts -t flattenCitations` — expect PASS, all cases.

- [ ] **Step 5: Wire `call-prep` into `IMPLS`** and dispatch generation-output validation by `def.output.schema` (both `summary-output.json` and `brief-output.json` stay in-package-validated):

```ts
import { callPrepImpl } from "./impl/call-prep.js";
import { validateBriefOutput } from "./impl/brief-schema.js";

const IMPLS: Record<string, SkillImpl> = {
  "call-prep": callPrepImpl as unknown as SkillImpl,
  "call-summary": callSummaryImpl as unknown as SkillImpl,
  "find-evidence": findEvidenceImpl as unknown as SkillImpl,
  "sow-review": sowReviewImpl as unknown as SkillImpl,
};

function validateGenerationOutput(schemaPath: string, output: unknown): { valid: boolean; errors: string[] } {
  if (schemaPath.endsWith("summary-output.json")) return validateSummaryOutput(output);
  if (schemaPath.endsWith("brief-output.json")) return validateBriefOutput(output);
  throw new Error(`runSkill: no in-package validator registered for output.schema "${schemaPath}"`);
}
```

Update the `generation` branch to call `validateGenerationOutput(def.output.schema, result.output)` in place of the current hardcoded `validateSummaryOutput` call.

- [ ] **Step 6: Add the `writeArtifact()` call site.** After the output-contract block, before `return`, for generation-tier skills carrying a write grant:

```ts
  let artifactPath: string | undefined;
  if (def.tier === "generation" && def.context_grants.write?.length) {
    if (citationsValid === false) {
      throw new Error(
        `${id}: refusing to persist — citation validity check failed; ` +
          `writeArtifact() is not called for output whose citations do not resolve`,
      );
    }
    const rendered = renderArtifactBody(id, result.output);
    const written = await ctx.loader.writeArtifact({
      accountSlug: mustParam(ctx.scopeParams.accountSlug, "accountSlug"),
      crmId: mustParam(ctx.scopeParams.oppId, "crmId/oppId"),
      kind: artifactKindFor(id),
      generatedBy: id,
      title: rendered.title,
      body: rendered.body,
      citations: rendered.citations,
      unsourcedClaims: rendered.unsourcedClaims,
    });
    artifactPath = written.artifactPath;
  }

  return {
    skillId: id,
    version: def.version,
    output: result.output,
    scopeResolved: result.scopeResolved,
    contextRead: result.contextRead,
    ...(citationsValid !== undefined ? { citationsValid } : {}),
    ...(artifactPath !== undefined ? { artifactPath } : {}),
    trace: result.trace,
  };
```

Add helpers (a third generation skill, `proposal-draft` in WI-3, adds one more case to each — this is the minimal per-skill extension point):

```ts
function mustParam(v: string | undefined, name: string): string {
  if (!v) throw new Error(`runSkill: missing scopeParams.${name}, required to persist an artifact`);
  return v;
}

function artifactKindFor(skillId: string): string {
  if (skillId === "call-prep") return "brief";
  throw new Error(`runSkill: no artifact kind mapping for generation skill "${skillId}"`);
}

interface RenderedArtifact {
  title: string;
  body: string;
  citations: { claim: string; path: string; span: [number, number] }[];
  unsourcedClaims: string[];
}

interface BriefOutputLike {
  goal: string;
  what_we_know: { text: string; citation: { path: string; span: [number, number] } }[];
  talking_points: { text: string; citation: { path: string; span: [number, number] } }[];
  risks: { text: string; citation: { path: string; span: [number, number] } }[];
  citations: { path: string; span: [number, number] }[];
  unsourced_claims: string[];
}

/** Renders a call-prep BriefOutput into an artifact body + flattened
 *  frontmatter citations (claim = the item's text). Mirrors exactly what
 *  write-findings.ts's renderFindingsArtifact already does for sow-review;
 *  artifact.json's citation shape ({claim, path, span}) is NOT touched by
 *  this slice — this is the mapping step from brief-output.json's runtime
 *  shape ({path, quote, span}) to it. */
function renderCallPrepBody(output: BriefOutputLike): RenderedArtifact {
  const citations: RenderedArtifact["citations"] = [];
  const section = (title: string, items: BriefOutputLike["what_we_know"]): string => {
    if (items.length === 0) return "";
    const lines = items.map((it) => {
      citations.push({ claim: it.text, path: it.citation.path, span: it.citation.span });
      return `- ${it.text}`;
    });
    return `\n## ${title}\n\n${lines.join("\n")}\n`;
  };
  for (const c of output.citations) {
    citations.push({ claim: "(overall source)", path: c.path, span: c.span });
  }
  const body = [
    "# Call-prep brief", "", output.goal,
    section("What we know", output.what_we_know),
    section("Talking points", output.talking_points),
    section("Risks", output.risks),
  ].join("\n");
  return { title: "Call-prep brief", body, citations, unsourcedClaims: output.unsourced_claims };
}

function renderArtifactBody(skillId: string, output: unknown): RenderedArtifact {
  if (skillId === "call-prep") return renderCallPrepBody(output as BriefOutputLike);
  throw new Error(`runSkill: no artifact renderer for generation skill "${skillId}"`);
}
```

Add `artifactPath?: string` to `SkillRunResult` in `packages/skills/src/types.ts`.

- [ ] **Step 7: Write the end-to-end `runSkill` test** for `call-prep` against a scratch corpus (mkdtemp + `cp` of `examples/demo-corpus/`, a local helper in `skills.test.ts` — the first place the skills package's tests need a real-write scratch copy, do not reuse `examples/demo-corpus/` directly):
  - `complete()` stubbed to return a valid `BriefOutput` citing real corpus text (e.g. a slice of `context/org/company.md`'s raw content, so the citation genuinely resolves) → `runSkill("call-prep", {...})` returns `citationsValid: true` and `artifactPath` matching the expected `artifacts/a-000N-brief.md` shape; reading that path back shows `generated_by: "call-prep"`.
  - `complete()` stubbed to return output whose `quote` cannot be found in any read file → citation resolves to an out-of-range span → `citationsValid: false` → `writeArtifact` is **not** called (assert via spy) and `runSkill` throws.

- [ ] **Step 8:**
```bash
pnpm vitest run packages/skills/src/skills.test.ts
pnpm typecheck
pnpm vitest --project skills
```

- [ ] **Step 9:**
```bash
git add packages/skills/src/runner.ts packages/skills/src/types.ts packages/skills/src/skills.test.ts
git commit -m "feat(skills): generalize runSkill citation-flattening (JC5) + wire call-prep + writeArtifact() call site"
```

---

## Task 9: Eval scorers + rubric/judge generalization for `call-prep`

**Files:** modify `evals/judge/judge.ts`, `evals/judge/judge.test.ts`; create `evals/judge/call-prep-rubric.md`, `evals/judge/call-prep-judge-prompt.md`.

- [ ] **Step 1: Write the failing test** — `scoreRubric` called with an explicit `{rubricFile, promptFile}` option still retry-medians correctly (stub `complete()` to return 3 identical score sets).

- [ ] **Step 2:** `pnpm vitest run evals/judge/judge.test.ts -t "explicit rubric"` — expect FAIL (no such option today).

- [ ] **Step 3: Generalize `scoreRubric`'s signature**: `scoreRubric(output: unknown, sourceText: string, opts?: {attempts?: number; rubricFile?: string; promptFile?: string})`. Default `rubricFile`/`promptFile` to the existing `rubric.md`/`judge-prompt.md` — **zero behavior change at `call-summary`'s existing call site**. Widen the first parameter's type from `SummaryOutput` to `unknown` (the judge only ever `JSON.stringify`s it).

- [ ] **Step 4:** `pnpm vitest run evals/judge/judge.test.ts` — expect PASS, including the pre-existing `call-summary`-shaped tests unaffected.

- [ ] **Step 5: Write `call-prep-rubric.md`** — four dimensions, **`grounding` / `completeness` / `tone` / `structure`** (same four key names as `call-summary`'s rubric — do not widen `RubricScores` to per-skill dimension names; `completeness` here means "does the brief capture everything the context supports the rep should walk in knowing," adapted for the brief shape rather than commitments):

```markdown
# call-prep rubric (v1) — ADVISORY ONLY (spec 004 JC6)

Four dimensions, 1-5. Aggregate = mean. Not a blocking gate — see
evals/judge/README.md and HANDOFF.md "Open follow-ups" #8.

## grounding
Does every what_we_know / talking_point / risk item trace to something
actually in the account/opportunity/org context provided?
- 5: every claim supported by its cited quote; [unsourced] used correctly.
- 3: one unsupported claim stated as fact.
- 1: brief asserts things not in the provided context.

## completeness
Does the brief capture everything the provided context supports the rep
should walk into this call knowing?
- 5: goal is concrete; talking points are actionable; risks are the real
     objections this context surfaces.
- 3: generic; misses a specific angle the context clearly supports.
- 1: goal is vague or talking points don't connect to this account.

## tone
Neutral internal prep material — no hype, no invented urgency.
- 5: reads like a sharp rep's own prep notes.
- 3: some editorializing.
- 1: reads like marketing copy.

## structure
Is the JSON contract-valid and are sections used as intended (goal is
one-to-two sentences, items are concise, no section is empty when material
exists)?
- 5: contract-valid, tight, each section pulling its weight.
- 3: contract-valid but one section is thin relative to available context.
- 1: would not have validated without repair.
```

- [ ] **Step 6: Write `call-prep-judge-prompt.md`**, same shape as `judge-prompt.md` with the `{{RUBRIC}}`/`{{NOTE}}`/`{{OUTPUT}}` tokens unchanged (the label in the prose changes to "SOURCE CONTEXT"/"BRIEF OUTPUT", the tokens `scoreRubric` substitutes do not) and the same fixed `{"grounding": N, "completeness": N, "tone": N, "structure": N}` JSON output contract as `call-summary`'s judge prompt.

- [ ] **Step 7:**
```bash
pnpm typecheck
pnpm vitest run evals/judge/judge.test.ts
git add evals/judge/judge.ts evals/judge/call-prep-rubric.md evals/judge/call-prep-judge-prompt.md evals/judge/judge.test.ts
git commit -m "feat(evals): generalize scoreRubric to an explicit rubric/prompt pair; add call-prep's rubric (advisory, JC6)"
```

---

## Task 10: `runCallPrepSuite()` — the scratch-corpus eval suite (JC9)

**Files:** modify `evals/runner/run-suite.ts`, `compare.ts`, `cli.ts`, `run-suite.test.ts`; create `evals/cases/call-prep/acme-prep.case.json`.

`writeArtifact()` runs for real here — this task is where JC9 actually gets implemented, and the one place a wrong choice would mutate the committed corpus.

- [ ] **Step 1: Write the case file** `evals/cases/call-prep/acme-prep.case.json`:

```json
{
  "id": "acme-prep",
  "skill": "call-prep",
  "input": {
    "account_slug": "acme-logistics",
    "opp_id": "006Ax0000GkLmNpQAA",
    "meeting_context": "Prep for the 2026-08-05 demo + technical review"
  },
  "scope_params": { "account_slug": "acme-logistics", "opp_id": "006Ax0000GkLmNpQAA" }
}
```

- [ ] **Step 2: Write the failing tests** in `run-suite.test.ts`: `ALL_SUITES` includes `"call-prep"` (unconditional); a conditionally-skipped block (needs `ANTHROPIC_API_KEY` — skip when absent) that runs `runSuite("call-prep")` and asserts (a) `gates.citation_validity === "PASS"`, and (b) `examples/demo-corpus/accounts/acme-logistics/.../artifacts/` has the **same directory listing before and after** the run — the committed corpus must be untouched.

- [ ] **Step 3:** `pnpm vitest run evals/runner/run-suite.test.ts -t "ALL_SUITES includes call-prep"` — expect FAIL.

- [ ] **Step 4: Extend `run-suite.ts`**:

```ts
export type SuiteName = "sow-review" | "find-evidence" | "call-summary" | "call-prep";
export const ALL_SUITES: SuiteName[] = ["sow-review", "find-evidence", "call-summary", "call-prep"];

export async function runSuite(suite: SuiteName): Promise<SuiteResult> {
  if (suite === "sow-review") return runReviewSuite();
  if (suite === "find-evidence") return runRetrievalSuite();
  if (suite === "call-summary") return runGenerationSuite();
  return runCallPrepSuite();
}
```

Add a scratch-corpus helper (mkdtemp + `cp` of `examples/demo-corpus/`, own module-local copy — do not import across the `evals/`/`context-core` test-dir boundary) and `runCallPrepSuite()`:

```ts
async function scratchCorpus(): Promise<{ tmpDir: string; root: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "ash-eval-call-prep-"));
  const root = join(tmpDir, "demo-corpus");
  await cp(join(REPO_ROOT, "examples/demo-corpus"), root, { recursive: true });
  return { tmpDir, root };
}

async function runCallPrepSuite(): Promise<SuiteResult> {
  const dir = join(CASES_DIR, "call-prep");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".case.json")).sort();
  const cases: CaseResult[] = [];

  for (const file of files) {
    const c = JSON.parse(await readFile(join(dir, file), "utf8")) as CallPrepCase;
    const { tmpDir, root } = await scratchCorpus();
    try {
      const loader = await createLoader({ repoRoot: REPO_ROOT, root });
      const result = await runSkill(
        "call-prep",
        {
          account_slug: c.input.account_slug,
          opp_id: c.input.opp_id,
          ...(c.input.meeting_context ? { meeting_context: c.input.meeting_context } : {}),
        },
        { loader, scopeParams: toScopeParams(c.scope_params) },
      );
      const output = result.output as BriefOutputForEval;

      const flatForScoring = [
        ...output.citations,
        ...output.what_we_know.map((x) => x.citation),
        ...output.talking_points.map((x) => x.citation),
        ...output.risks.map((x) => x.citation),
      ].map((cit) => ({ path: cit.path, span: cit.span, relevance: 1, why: "" }));
      const citations = await scoreRetrievalCitations(loader, flatForScoring);

      const rubric = await scoreRubric(output, flatForScoring.map((c) => c.path).join("\n"), {
        rubricFile: "call-prep-rubric.md",
        promptFile: "call-prep-judge-prompt.md",
      });

      cases.push({
        id: c.id,
        metrics: { rubric_aggregate: round(rubric.aggregate), citation_validity: round(citations.validity) },
        gates: { citation_validity: citations.validity >= 1 ? "PASS" : "FAIL" },
        injectionBlocked: null,
        notes: [
          `rubric aggregate ${round(rubric.aggregate)} (advisory target 4.0)`,
          `artifact written to scratch corpus: ${result.artifactPath}`,
          ...(citations.failures.length ? [`citation failures: ${citations.failures.join("; ")}`] : []),
        ],
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  return aggregateSuite("call-prep", cases);
}
```

- [ ] **Step 5: Extend `compare.ts`**: `"call-prep": ["citation_validity"]` in `PRIMARY`.

- [ ] **Step 6: Update `cli.ts`**'s usage string to include `call-prep`.

- [ ] **Step 7:** `pnpm vitest run evals/runner/run-suite.test.ts` — expect PASS (the `ALL_SUITES` assertion runs unconditionally; the live block is conditionally skipped).

- [ ] **Step 8: Local live smoke** (requires the key):
```bash
ANTHROPIC_API_KEY=sk-... pnpm eval --suite call-prep --no-compare
git status examples/demo-corpus/    # must be clean — confirms JC9's scratch-corpus wiring holds
```

- [ ] **Step 9:**
```bash
pnpm typecheck
git add evals/runner/run-suite.ts evals/runner/compare.ts evals/runner/cli.ts evals/runner/run-suite.test.ts evals/cases/call-prep/
git commit -m "feat(evals): runCallPrepSuite() against a scratch corpus copy — writeArtifact() runs for real, examples/demo-corpus/ untouched (JC9)"
```

---

## Task 11: Corpus / no-real-data sanity pass

**Files:** none — verification checkpoint, first point every new schema/fixture/case file exists together.

- [ ] **Step 1:**
```bash
pnpm corpus:validate
pnpm check:no-real-data
```
Expect PASS. No commit — checkpoint only.

---

## Task 12: Calibration pass (advisory rubric sanity check, bounded)

**Files:** modify `evals/judge/call-prep-rubric.md` (anchors only, if needed), `evals/judge/README.md`.

Scaled-down relative to plan 002's Task 12 because JC6 already ratifies advisory-only without a numeric target — this task confirms the judge doesn't degenerate, nothing more.

- [ ] **Step 1:** Run `ANTHROPIC_API_KEY=... pnpm eval --suite call-prep --no-compare` 3 times; record `rubric_aggregate` and the four dimensions each run.

- [ ] **Step 2: Assess** — confirm the judge call never throws (parseable JSON every run); scores are not suspiciously pinned at a constant; manually read one generated brief and sanity-check it against `a-0001-brief.md`'s shape/quality as a loose reference (not a byte-for-byte match). If the judge is degenerate, fix the rubric/prompt — do not chase a numeric target, there is none.

- [ ] **Step 3:** Append (do not overwrite) a `## call-prep judge` section to `evals/judge/README.md`: rubric file, shared judge model, observed score range across the 3 runs, explicit note the gate is advisory per JC6 and `HANDOFF.md` open-follow-up #8.

- [ ] **Step 4:**
```bash
git add evals/judge/call-prep-rubric.md evals/judge/README.md
git commit -m "test(evals): sanity-calibrate call-prep rubric (advisory only, JC6 — no numeric target to hit)"
```

---

## Task 13: CI wiring check

**Files:** `.github/workflows/evals.yml`, only if needed.

- [ ] **Step 1:** `ANTHROPIC_API_KEY` is already wired into `evals.yml` by plan 002 — `call-prep` reuses the exact same `impl/llm.ts` seam and env var, no new secret. Confirm the workflow's suite invocation already covers `call-prep` once it's in `ALL_SUITES` (Task 10). If the workflow names suites individually, add `call-prep`; otherwise no change, no commit.

---

## Task 14: Docs + committed eval result

**Files:** modify `CLAUDE.md`, `HANDOFF.md`; add `evals/results/<date>-<sha>.json`.

- [ ] **Step 1: `CLAUDE.md`** — add `call-prep` to "what exists" (alongside `call-summary`), remove it from "not yet built." Add to "Eval gates":

```markdown
- `call-prep` (generation) — **one hard gate:** citation validity = **1.00**
  (deterministic, resolve-only). The LLM-judge rubric (target ≥ 4.0/5) is
  **advisory** — same rationale as `call-summary`'s (spec 004 JC6, extending
  intent 002 amendment A1 to a second generation skill). `writeArtifact()`
  persists every accepted output as a new artifact + opens an `unused`
  outcome record automatically.
```

- [ ] **Step 2: `HANDOFF.md`** — mark the WI-2/intent-004 row `done` in the work-chain table; update "Last updated"; add an "Intent 004 — call-prep + the write path — SHIPPED" section (mirroring the existing intent-002 section's shape): key outcomes, and the seam claim explicitly noting `packages/context-core/src/types.ts` **did** gain additive exports this time (unlike 002's zero-diff claim) — call this out, don't let it read as silently unchanged. Note in "Open follow-ups" #8 that WI-2 is now done, so its premise (two generation skills, still zero blocking quality gates) holds doubly.

- [ ] **Step 3: Commit the eval result:**
```bash
ANTHROPIC_API_KEY=sk-... CI=true pnpm eval --suite all
git add CLAUDE.md HANDOFF.md evals/results/
git commit -m "docs: call-prep gates in CLAUDE.md; HANDOFF WI-2 done; first call-prep eval result"
```

---

## Task 15: Full verification + PR

- [ ] **Step 1:**
```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm corpus:validate
pnpm check:no-real-data
pnpm skills:check
```
All must pass.

- [ ] **Step 2:**
```bash
ANTHROPIC_API_KEY=sk-... pnpm eval --suite all
```
Expect: `sow-review`/`find-evidence`/`call-summary` gates unchanged (no net regression vs. the last committed result); `call-prep` `citation_validity` PASS; overall regression verdict PASS.

- [ ] **Step 3: Confirm the write-path guarantees by hand:**
```bash
git status examples/demo-corpus/    # clean after the eval run
git diff main -- packages/skills/src/skill-def.schema.json   # empty — seam claim holds
```

- [ ] **Step 4: Open the PR:**
```bash
git push -u origin intent/004-call-prep-write-path
gh pr create --title "feat: call-prep + the write path (WI-2, #7)" --body "..."
```

PR body includes: links to intent 004 / spec 004 / this plan; confirmation `examples/demo-corpus/` stayed clean across the full eval run (JC9); the seam claim including the `types.ts` deviation called out explicitly; the note that the rubric gate ships advisory for `call-prep` per JC6, tracked in `HANDOFF.md` open-follow-up #8; the eval result table.

- [ ] **Step 5:** Watch `evals.yml` on the PR — confirm the comment posts with the `call-prep` suite and a PASS regression verdict.

---

## Verification (end to end)

1. **Unit (no network):** `pnpm vitest --project context-core` and `pnpm vitest --project skills` — all green; `writeArtifact()`, `flattenCitations`, `call-prep` impl all covered with `complete()` stubbed and scratch corpora.
2. **Schema:** `pnpm corpus:validate` — `brief-output.json` compiles; existing corpus (including both `a-0001-brief.md` fixtures) still validates.
3. **Skill drift:** `pnpm skills:check` — `.claude/skills/call-prep/SKILL.md` in sync.
4. **Hook:** `pnpm vitest run .claude/hooks/protect-paths.test.ts` — direct writes to `**/artifacts/**` blocked under both roots.
5. **Live skill run:** `ANTHROPIC_API_KEY=... pnpm eval --suite call-prep --no-compare` — citation_validity gate PASS; `git status examples/demo-corpus/` clean afterward.
6. **No regression:** `ANTHROPIC_API_KEY=... pnpm eval --suite all` — PASS; `sow-review`/`find-evidence`/`call-summary` aggregates unchanged.
7. **CI:** `evals.yml` runs green on the PR, posts the eval comment including `call-prep`.
8. **Seam claim:** `git diff main -- packages/skills/src/skill-def.schema.json` is empty. `packages/context-core/src/types.ts` gains only additive exports (documented explicitly in `HANDOFF.md` and the PR body, not silently claimed unchanged).

---

## Critical files (implementation order matters most for these)

- `packages/context-core/src/write-path.ts` — the write path itself; everything else depends on it (Task 1)
- `packages/skills/src/runner.ts` — the JC5 generalization + new `writeArtifact()` call site; highest-risk single file (Task 8)
- `packages/skills/src/impl/call-prep.ts` — the generation skill, mirrors `call-summary.ts` (Task 7)
- `context/schema/brief-output.json` — output contract, cross-checked against the pre-existing `a-0001-brief.md` fixtures (Task 3)
- `.claude/hooks/protect-paths.ts` — the enforcement boundary that makes `writeArtifact()` the *only* path (Task 2)
- `evals/runner/run-suite.ts` — the JC9 scratch-corpus suite wiring; the one place a wrong choice mutates the committed corpus (Task 10)
