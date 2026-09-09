# Agentic Sales Hub — Adoptability Amendment

**Implementation spec** · Amends `AgenticSalesHub_Spec_v2.md` · Companion: `AgenticSalesHub_AI-SDLC-Framework_v1.md`
**Date:** 2026-09-08 · **Status:** approved, ready to implement · **Owner:** Andrew Abbott

---

## 0. How to use this document

This is a **program-level spec**. It does not get implemented in one pass. It defines shared contracts (§1–§5) and then six work items (§6–§11), each of which becomes its own intent → spec → plan → PR under the tiering rules in the SDLC framework §3.

**Read §1–§5 once. They apply to every work item below.**

**Hard rules for whoever implements this:**

1. **One work item per PR.** WI-1 through WI-5 are each T2 and each needs its own committed `intent.md` and `spec.md` before code.
2. **The order is a dependency chain, not a preference.** WI-0 → WI-1 → WI-2 → WI-3 → WI-4 → WI-5. WI-1 must land before WI-4 or the MCP server bakes in a hardcoded context root.
3. **Never weaken an eval gate to make a work item pass.** If a gate blocks, the implementation is wrong or the spec is wrong — raise it, don't lower the bar. Gate values are in §13.
4. **Never hand-edit a compiled `.claude/skills/<id>/SKILL.md`.** They are generated. CI drift-check will fail.
5. **Do not add skills.** Five product skills plus one setup skill. Anything else is roadmap.
6. Intent 002 (`call-summary`) is in flight and untouched by this document.

---

## 1. Why this amendment exists — the constraints behind the judgment calls

Spec v2 optimizes for one win condition: *credibility asset, legible to an outside observer in 20 minutes.* A second, co-equal objective is now in force:

> **A sales organization can clone this, populate its own context, and get useful output without meaningful rework.**

**Amended tiebreaker rule** (replaces v2's): when depth and legibility conflict, choose legibility. When legibility and adoptability conflict, choose adoptability — *but only if the adoptable version is still inspectable.*

**The governing constraint.** Every customization surface must be documented, evaluated, and supported by one person through Q4. One rule keeps that survivable, and it decides most ambiguous calls in this spec:

> **If a customization cannot be expressed as a file validated by a published schema, it is a fork — and forks are how "no rework" becomes "lots of rework."**

This rules out per-org skill generation, per-org code branches, and unbounded prompt overrides. It leaves room for deep specialization through data.

**The deployment model.** There is no deploy. `clone` → `pnpm install` → register the MCP server in `.mcp.json` → `/onboard`. No hosting, no signup, no account, no data leaving the machine.

---

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| **D-A1** | **Compile skills, don't generate them.** One implementation per capability, specialized by data at compile time. | An LLM authoring a bespoke skill per org is a fork: no upstream improvements, and the golden set scores nothing about the copies in the wild. |
| **D-A2** | **Customization is three schema'd knobs plus a capped escape hatch** — voice, playbook, output templates; overrides ≤ 2,000 chars. | §5.2. |
| **D-A3** | **`context/` ships empty. The corpus moves to `examples/demo-corpus/`.** Context root is configurable. | An adopter's first act must not be deleting demo data out of the directory they are meant to fill. |
| **D-A4** | **`/onboard` replaces the context editor screen.** | Schema-validated markdown authoring is what an agent does well and a CRUD form does badly. |
| **D-A5** | **The write path is a named component** with three functions and its own tests. | v2 leaves "piping" as scattered design rules. It is the thing an adopter installs. |
| **D-A6** | **`routeIntake()` is a trust boundary with default-deny.** | Low classification confidence resolves to `inbound/` quarantine, never to trusted context. |
| **D-A7** | **Corpus lives in-repo under `examples/`,** not a separate package. | It is the eval golden set. Splitting it splits the harness. |
| **D-A8** | **Install: template repo + `pnpm init:context` in Phase 1; `npx create-agentic-sales-hub` in Phase 3.** | An install path first tested in December does not work in December. |
| **D-A9** | **`/onboard` is a setup skill, listed separately from the five product skills.** | Preserves the "five skills, done to depth" positioning. |
| **D-A10** | **Overrides cap at 2,000 chars and appear in the trace as a first-class input, with a hash.** | An unbounded override is a fork with extra steps. |
| **D-A11** | **README leads with the 60-minute adoption path; the SDLC and eval story is section two.** | Two audiences, one first paragraph. Adoption earns the read; the eval story earns the trust. |
| **D-A12** | **Project name is Agentic Sales Hub at every level.** Supersedes v2 §1.5. | §3. |

---

## 3. Naming — supersedes v2 §1.5

v2 §1.5 recommended "Deal Desk." **Withdrawn.** The rename is total.

| Surface | Name |
|---|---|
| Product / repo | `agentic-sales-hub` |
| MCP server package | `packages/mcp-agentic-sales-hub`, registers as `agentic-sales-hub` |
| Config file | `ash.config.json` |
| Env vars | `ASH_*` — `ASH_CONTEXT_ROOT` (new), `ASH_TAINT_LEDGER` (renamed from `ASH_TAINT_LEDGER`) |
| Initializer (Phase 3) | `npx create-agentic-sales-hub` |

No back-compat alias for the old env var. Clean break — the project is pre-release and solo.

**What survives from v2 §1.5** is the positioning, which is name-independent:

> **Agentic Sales Hub** — the layer between "we have a meeting" and "we have signed paper."
>
> One context substrate per opportunity. Five agents that read it. Every artifact they produce cites the context it came from, and every one of them is scored against a golden set before it ships.

---

## 4. Target repository layout (end state)

```
agentic-sales-hub/
├─ ash.config.json              # NEW — context root, org slug, compile settings
├─ CLAUDE.md  REVIEW.md  CORPUS.md
├─ context/                     # THE ADOPTER'S SUBSTRATE — ships effectively empty
│  ├─ schema/                   # published JSON Schemas — unchanged, still the spec
│  ├─ templates/                # NEW — blank, commented starter file per schema type
│  └─ org/ demand-gen/ legal/ accounts/     # .gitkeep only in the published repo
├─ examples/
│  └─ demo-corpus/              # MOVED from context/ — Meridian Grid / Acme
│     └─ org/ demand-gen/ legal/ accounts/  # identical tree, FICTIONAL frontmatter
├─ intake/                      # NEW — drop zone for raw files awaiting routeIntake()
├─ packages/
│  ├─ context-core/             # + config.ts, write-path.ts
│  ├─ skills/
│  └─ mcp-agentic-sales-hub/    # WI-4
├─ apps/surface/                # trace viewer only (context editor cut)
├─ evals/                       # golden/ cases/ runner/ results/
└─ docs/                        # intent/ specs/ plans/ decisions/ sdlc/
```

---

## 5. Shared contracts

### 5.1 Context root resolution

```ts
// packages/context-core/src/config.ts
export interface AshConfig {
  contextRoot: string;                     // default "./context"
  org?: { slug: string };
  compile?: { skillOverridesMaxChars: number };  // default 2000
}

export function resolveContextRoot(opts?: { root?: string }): string;
```

**Precedence:** `opts.root` → `ASH_CONTEXT_ROOT` → `ash.config.json` `contextRoot` → `./context`. Resolved to an absolute path.

`createLoader()` takes an optional `{ root }`; when omitted it calls `resolveContextRoot()`. **No other module may read the root directly.**

**An empty `context/` is a valid state, not an error.** The loader returns an empty tree. A fresh clone must not throw before `/onboard` has run. This is an acceptance criterion, not a nicety.

### 5.2 The three customization knobs

All three are markdown with typed frontmatter, validated by new schemas in `context/schema/`. **All three are optional** — an org that writes none of them gets the base skill behavior. Missing knob files are omitted from the compile, never errors.

**`context/org/voice.md` → `voice.json`**

| Field | Type | Notes |
|---|---|---|
| `register` | enum | `formal` \| `professional` \| `conversational` \| `direct` |
| `person` | enum | `first-plural` \| `first-singular` \| `third` |
| `sentence_length` | enum | `short` \| `mixed` \| `long` |
| `banned_phrases` | string[] | Hard filter; a generation skill must not emit these |
| `preferred_terms` | `{avoid, use}[]` | e.g. avoid "solution", use "platform" |
| `length_defaults` | object | Per artifact kind, in words |
| `formatting` | object | `bullets_allowed`, `headings_allowed`, `emoji` (default false) |
| `examples` | `{good: string[], bad: string[]}` | Few-shot, ≤ 3 each |

**`context/org/playbook.md` → `playbook.json`**

| Field | Type | Notes |
|---|---|---|
| `qualification_framework` | enum + `custom_fields[]` | `MEDDIC` \| `MEDDPICC` \| `SPICED` \| `BANT` \| `custom` |
| `stages` | `{name, definition, exit_criteria}[]` | Mirrors the org's CRM stages |
| `discovery_questions` | `{topic, question}[]` | Question bank for `call-prep` |
| `proposal_required_sections` | string[] | Enforced by `proposal-draft` |
| `disqualifiers` | string[] | Conditions that should surface as a risk, not be written around |

Pricing authority stays in `context/org/pricing.md` (v2 §4.2). The playbook **references** it; it must not duplicate it.

**`context/org/templates/<kind>.md` → `output-template.json`**

| Field | Type | Notes |
|---|---|---|
| `kind` | enum | `brief` \| `summary` \| `proposal` \| `findings` |
| `sections` | `{id, heading, required, guidance, max_words}[]` | Ordered |
| `front_matter` | object | Required frontmatter keys on the generated artifact |

**Rule:** a generation skill must emit every `required: true` section. A missing required section is a validation error at `runSkill` output-contract enforcement — never a silent omission.

**`context/org/skill-overrides/<skill-id>.md`** — plain markdown, ≤ `compile.skillOverridesMaxChars` (default 2,000). Appended to the compiled prompt under an explicit delimiter. Appears in the trace as a first-class input with its hash. **CI check fails if any override file exceeds the cap.**

### 5.3 The write path

```ts
// packages/context-core/src/write-path.ts

export type ArtifactKind = "brief" | "summary" | "proposal" | "findings";

export async function writeArtifact(input: {
  opportunityId: string;
  kind: ArtifactKind;
  body: string;
  citations: Citation[];
  skillId: string;
  skillVersion: number;
}): Promise<{ artifactId: string; path: string }>;
// Mints the id, validates body against the kind's output schema and (if present)
// the org output template, writes to artifacts/, and opens an outcome record
// with status "unused". Enforces the skill's declared write grant.

export type Outcome =
  | "sent" | "won" | "lost"
  | "redline_accepted" | "redline_rejected"
  | "superseded" | "unused";

export async function appendOutcome(input: {
  opportunityId: string;
  artifactId: string;
  outcome: Outcome;
  date: string;            // ISO 8601
  note?: string;
}): Promise<void>;
// Append-only to outcomes.jsonl. Rewriting or deleting a record is not exposed.

export type IntakeClassification =
  | "meeting_note" | "counterparty_document" | "org_material" | "unknown";

export async function routeIntake(input: {
  filePath: string;              // must be under intake/
  opportunityId?: string;
}): Promise<{
  classification: IntakeClassification;
  confidence: number;
  destination: string;
  quarantined: boolean;
}>;
```

**`routeIntake()` is a security control (D-A6). Default-deny:**

- `counterparty_document`, `unknown`, **or any classification with confidence < 0.85** → routes to `inbound/`, `quarantined: true`, records `source_hash`, appends to the taint ledger. Full v2 §9 treatment.
- Only `meeting_note` at confidence ≥ 0.85 routes to `meetings/`.
- `org_material` **never auto-writes to `context/org/**`.** Canonical context is review-gated (v2 §4.1, mutability class 1). It routes to a staging path for `/onboard` to process.
- Never deletes the intake file. Moves it and records the move.

A misroute toward quarantine costs a manual move. A misroute the other way is an injection path into trusted context. **This gets its own eval case, alongside the existing injection case.**

### 5.4 Compiled SKILL.md provenance header

`pnpm skills:sync` becomes `pnpm skills:compile`. It interpolates the org knobs into the generated `.claude/skills/<id>/SKILL.md` and prepends:

```yaml
# --- compiled by skills:compile — do not edit ---
compiled_from:
  definition: packages/skills/src/definitions/call-prep.yaml@sha256:a1b2c3d4e5f6
  voice:      context/org/voice.md@sha256:1122334455ff          # omitted if absent
  playbook:   context/org/playbook.md@sha256:99aabbccddee        # omitted if absent
  template:   context/org/templates/brief.md@sha256:0f0e0d0c0b0a  # omitted if absent
  overrides:  context/org/skill-overrides/call-prep.md@sha256:...  # omitted if absent
compiled_at: 2026-09-08T14:00:00Z
```

This makes "why did it say that?" answerable at the configuration level, not only at the citation level. Drift-check stays: a hand-edited compiled SKILL.md fails CI.

---

## 6. WI-0 — Rename to Agentic Sales Hub · **T0**

**Scope.** Mechanical rename per §3, in one PR, before anything else.

**Files touched**

- `.claude/hooks/quarantine-inbound.ts` — `ASH_TAINT_LEDGER` → `ASH_TAINT_LEDGER`
- `evals/runner/injection-harness.ts` — same env var
- `README.md`, `CLAUDE.md`, `HANDOFF.md`, `PR-LOOP.md`, `docs/**` — prose and identifiers
- `package.json` names, any `deal-desk` path or package reference
- `.gitignore` — confirm `.claude/.taint-ledger*.jsonl` still matches

**Acceptance**

- `rg -i "deal.?desk" --hidden` returns hits only in `docs/decisions/**` (historical ADRs stay as written) and git history.
- `pnpm typecheck && pnpm test && pnpm build && pnpm lint` green.
- `pnpm eval --suite all` green, **including `injection: PASS`** — this is the one that proves the ledger env rename landed in both places.

---

## 7. WI-1 — Tenancy seam · **T2** · intent 003

**Scope.** Make the context root configurable and move the corpus out of `context/`.

**Out of scope.** Multi-tenancy. One repo per organization. The config root separates demo data from real data and lets evals target a fixture — nothing more. Say this in the README before someone asks.

**Steps**

1. Add `packages/context-core/src/config.ts` per §5.1. Thread `{ root }` through `createLoader()`.
2. `git mv` the corpus tree from `context/` to `examples/demo-corpus/`. Leave `context/schema/` in place; add `context/templates/` and `.gitkeep`s.
3. Repoint everything in the blast radius below.
4. Add `ash.config.json` with `contextRoot: "./context"`.

**Blast radius — do not miss these**

| Thing | Change |
|---|---|
| `packages/context-core/src/loader.ts` | `createLoader({ root })` |
| `pnpm corpus:validate` | Takes `--root`, defaults to `examples/demo-corpus` |
| `pnpm check:no-real-data` | Now targets `examples/demo-corpus/accounts/**` |
| **NEW `pnpm check:context-empty`** | Fails if `context/` holds anything but `schema/`, `templates/`, `.gitkeep` |
| `evals/golden/corpus.lock.json` | Paths change — regenerate with `pnpm eval:lock` |
| `evals/runner/lock-corpus.ts` | Root parameter |
| `evals/cases/**` | Fixture paths referencing `context/accounts/...` |
| `.claude/settings.json` | The `Read` deny rule on `inbound/**` must match both roots |
| `.claude/hooks/protect-paths.ts` | Add `examples/demo-corpus/legal/**` alongside `context/legal/**` |
| `context/schema/README.md` | Path→schema table |
| `CORPUS.md` | Location references |
| `ci.yml` | Add `check:context-empty` |

**Acceptance**

- `ASH_CONTEXT_ROOT=examples/demo-corpus pnpm eval --suite all` — green, with gate values **identical** to `evals/results/2026-09-07-434b594.json`. A changed score means the move changed behavior; find out why before merging.
- `pnpm corpus:validate --root examples/demo-corpus` → 28 files, 0 errors.
- `pnpm check:context-empty` passes on a clean tree and fails when a file is planted in `context/org/`.
- **With no env var and no config, `createLoader()` against an empty `context/` returns an empty tree and does not throw.**
- `pnpm eval:lock` regenerated; lock paths rooted at `examples/demo-corpus`.

**Second payoff, worth wiring now:** the same configurable root lets an adopter point the eval harness at their own golden set. Document that in the README — it converts the eval suite from a credibility flex into an adoption feature.

---

## 8. WI-2 — `call-prep` + the write path · **T2** · intent 004

**Scope.** The second LLM-backed generation skill, following the pattern intent 002 establishes, plus artifact persistence.

**Deliverables**

- `packages/skills/src/impl/call-prep.ts` — LLM-backed, behind the existing `SkillImpl` interface.
- `context/schema/brief-output.json` — output contract.
- `context/schema/outcome-record.json` — the `outcomes.jsonl` line shape.
- `packages/context-core/src/write-path.ts` — `writeArtifact()` and `appendOutcome()` per §5.3. `routeIntake()` is **not** in this work item; it lands in WI-5.
- Generation-class eval cases for `call-prep`.

**New enforcement.** Extend `.claude/hooks/protect-paths.ts` to deny direct `Write`/`Edit` to `**/artifacts/**`. Artifacts are written through `writeArtifact()` or not at all — that is what makes the citation and outcome guarantees real rather than advisory.

**Acceptance**

- `pnpm eval --suite call-prep`: rubric ≥ 4.0/5, citation validity = 1.00.
- `writeArtifact()` refuses a body missing a required section when an output template is present, and refuses a write outside the skill's declared grant. Both have unit tests.
- Every artifact written opens an `unused` outcome record. `appendOutcome()` cannot rewrite or delete an existing line — unit test.
- The protect-paths hook blocks a direct write to `artifacts/` — test in the hook suite.

---

## 9. WI-3 — `proposal-draft` · **T2** · intent 005

**Scope.** The largest and least checkable generation skill. Its own intent for exactly that reason.

**Uses a built-in default structure.** Template-driven output arrives in WI-5; do not build the template loader here.

**Acceptance**

- `pnpm eval --suite proposal-draft`: rubric ≥ 4.0/5, citation validity = 1.00.
- **New hard gate: no uncited price, discount, or delivery commitment.** Every numeric or contractual claim resolves to `context/org/pricing.md`, `offerings/**`, or a commitment in a meeting note. An uncited one fails the suite — it does not get an `[unsourced]` marker and pass. Pricing is the one place where a plausible invention is a commercial liability rather than an editing task.

---

## 10. WI-4 — MCP server + corpus expansion · **T2** · intent 006

**Scope.** `packages/mcp-agentic-sales-hub` and the v2 §10 corpus expansion.

**Deliverables**

- MCP server exposing `context.read`, `context.search`, `artifact.write`, `skill.run`, `trace.get`. Registers as `agentic-sales-hub`.
- Enforces context grants at the server boundary, not by prompt. Emits traces.
- Reads the context root via `resolveContextRoot()` — **never a hardcoded path.**
- Corpus expansion: 3 more opportunities (~12 meeting notes total), a second counterparty redline with labeled findings.
- `.mcp.json` example in the README.

**Acceptance**

- A fresh `.mcp.json` pointing at an arbitrary `contextRoot` works with no code change.
- `pnpm corpus:validate` passes on the expanded corpus; `pnpm eval:lock` regenerated.
- Grant enforcement has a negative test: `call-prep` attempting to read `legal/templates/**` through the server is refused.

---

## 11. WI-5 — Adoption layer · **T2** · intent 007

**Scope.** Everything that makes ship criterion #7 true.

**Deliverables**

1. **`/onboard`** — a setup skill (D-A9), listed separately from the five. Reads `intake/`, interviews the user for what the material doesn't cover, writes `context/org/**`, `demand-gen/icp/**`, `legal/**` against the published schemas. **Marks every field it cannot source `[unsourced]` rather than inventing it.** Same interview-and-synthesize shape as the existing `write-intent` dev skill.
2. **The three knob schemas** — `voice.json`, `playbook.json`, `output-template.json` (§5.2) — plus commented starter files in `context/templates/`.
3. **`skills:sync` → `skills:compile`** — knob interpolation and the provenance header (§5.4). Drift-check preserved.
4. **`routeIntake()`** per §5.3, with its default-deny eval case.
5. **`pnpm init:context`** — scaffolds an empty context tree and `ash.config.json` (D-A8).
6. **README rewrite** — leads with the 60-minute adoption path; SDLC and evals second (D-A11).

**Acceptance**

- `pnpm skills:compile` with **no** knob files present produces byte-identical SKILL.md output to the current `skills:sync`. Out-of-the-box behavior must not change for an org that customizes nothing.
- With knob files present, the compiled SKILL.md carries the provenance header and the interpolated content; drift-check still fails on a hand edit.
- An override file over the cap fails CI.
- `routeIntake()` eval case: a counterparty document with an embedded injection attempt, and a low-confidence ambiguous file, both land in `inbound/` quarantined.
- **Ship criterion #7 dry run**, documented in `docs/adoption-test.md`: a person who is not Andrew, starting from a clone, produces a call-prep brief they would use, with elapsed time recorded. Under 60 minutes.

---

## 12. Amendments to v2, by section

| v2 § | Change |
|---|---|
| §1.5 naming | **Superseded** — §3 of this document |
| §2 ship criteria | Amend #1 to "…against the **example corpus**"; add #7 (§13) |
| §4.2 layout | Replaced by §4 of this document |
| §5.2 skill set | Five product skills unchanged; `/onboard` added as a setup skill |
| §5.3 skill definition | Add the three knobs as compile inputs; add the provenance header |
| §6 architecture | `packages/mcp-agentic-sales-hub` → `packages/mcp-agentic-sales-hub` |
| §7 surface | Three screens → **trace viewer only**, plus a static eval board generated from `evals/results/`. Context editor cut. |
| §10 corpus | Content and quality bar unchanged. Reclassified as **eval fixture and demo tenant**, not substrate. |
| §11 phasing | Sequence in §6–§11 of this document |
| §12 open decisions | #1 (public from day one) and #2 (license) are now **blocking** — an adoptable repo needs its license settled before the first outside clone |

---

## 13. Ship criteria and gates

**Amended v2 §2 ship criteria — v1 is done when all seven are true.**

1. A stranger clones the repo, follows the README, and produces a call-prep brief and a proposal draft **against the example corpus** in under 10 minutes.
2. Every generated artifact carries a citation map, and the trace viewer renders it.
3. The eval suite runs in CI on every PR, publishes a pass rate, visible in the README badge and the eval board.
4. The context spec is published as a standalone document.
5. One written build log and one ≤5-minute demo video are published.
6. Nothing in the repository is anyone's confidential material.
7. **NEW — A stranger points it at their own organization, populates context via `/onboard`, and produces a call-prep brief they would actually use for a real opportunity, in under 60 minutes.**

**Eval gates — unchanged, non-negotiable.**

| Gate | Value |
|---|---|
| Review blocker recall | **1.00** |
| Review precision | ≥ 0.70 |
| Citation validity | **1.00** |
| Retrieval recall on required spans | ≥ 0.90 |
| Generation rubric | ≥ 4.0 / 5 |
| Net regression vs. last committed result | none, any suite |

Plus, from WI-3: **no uncited price, discount, or delivery commitment in `proposal-draft` output.**

---

## 14. Unchanged from v2 — do not revisit while implementing

Adoptability raises the value of all of these. An organization with a legal department adopts *because* of the provenance and quarantine story.

- Mandatory provenance and `[unsourced]` marking on every generation skill.
- `inbound/**` read-only and quarantined; review skills hold no write grant; the quarantine hook.
- Least-privilege context grants enforced at the loader and the MCP boundary, never by prompt.
- Append-only accumulating context; canonical context review-gated.
- CRM-shaped opportunity IDs as the primary key. **No CRM integration** — the ID is the seam and it stays that way.
- Five product skills. `msa-review`, `msa-create`, `sow-create`, `proposal-scratch`, `publish-proposal`, `case-study-generate` remain named roadmap.
- No dashboards, no auth, no billing, no multi-tenancy, no e-signature.
- The full AI-SDLC artifact chain. The process is still half the deliverable.

---

*Companion documents: `AgenticSalesHub_Spec_v2.md` (what gets built) · `AgenticSalesHub_AI-SDLC-Framework_v1.md` (how it gets built).*
