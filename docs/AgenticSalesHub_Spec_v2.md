# Agentic Sales Hub — Solution Spec (v2)

**Working name:** *Deal Desk* — an AI-native deal desk for sellers
**Status:** Spec, pre-build · **Date:** 2026-09-06 · **Supersedes:** `AgenticSalesHub_Plan_v1.md`
**Owner:** Andrew Abbott (solo)

---

## 0. Decisions locked since v1

v1 was written while you were inside Product School and had a pilot org, real deal data, and a legal template library within reach. None of that is true now, and four decisions follow from it.

| Decision | Choice | What it forces |
|---|---|---|
| Win condition | Credibility asset first, commercial optionality preserved | Everything must be legible to an outside observer in 20 minutes. Public repo, clean licensing, no third-party confidential material anywhere in it. |
| Deal context | Engineered synthetic corpus for everything public; private validation against your own real material | The corpus is a first-class deliverable, not a fixture. If it isn't convincing, the demo isn't convincing. |
| Form factor | Hybrid — Claude-native agent core (skills + MCP + subagents) with a thin web surface | The agent core is the product. The surface exists to make the agent's work *inspectable*, not to be an app. |
| Cadence | ~30+ hrs/week through Q4 2026 | A real quarter-length plan with dates, not "1–2 months" ranges. Roughly 2× the v1 phase velocity. |

**Tiebreaker rule for every scope question in this spec:** when depth and legibility conflict, choose legibility. You are building proof, and proof that nobody can evaluate is not proof.

---

## 1. Critique of v1, and the positioning that replaces it

### 1.1 The white-space claim is the load-bearing claim, and it doesn't hold

v1 §2 says: *"None of these own call prep, proposal generation, or SOW/MSA drafting and review as a first-class, context-grounded workflow. That's genuine white space."*

That's not survivable in a room with anyone who knows the category. As of 2026:

- **AI proposal/RFP generation** is a crowded, funded category — Inventive, Bidara, Qwilr, PandaDoc, Proposify, Responsive, plus a long tail of agent-builder templates. Comparison articles rank twenty of them.
- **AI contract/MSA review** is its own crowded category — Spellbook, GC AI, Ironclad, LegalOn, LinkSquares, and a wave of "agentic contract review" entrants explicitly marketing MSA and DPA review.
- **Call prep** is being absorbed from two directions at once: conversation-intelligence incumbents (Gong, Clari) pushing forward into pre-call, and CRM-native agents (Agentforce, Breeze) pushing outward from the deal record.

The scan in v1 was accurate about the *categories it listed*. It was wrong about what those categories don't cover — because it looked at sales-engagement vendors and not at proposal software or legal tech, which is where deal execution actually got automated.

The honest, and still interesting, version of the claim:

> Each piece of deal execution has a point solution. Every one of them re-asks you for the same context — who the account is, what you sell, what you've promised before, what your paper allows — and none of them share it. The proposal tool doesn't know what you said on the call. The contract reviewer doesn't know what you promised in the proposal. The seller is the integration layer, by hand, on every deal.

That's a **context-consolidation** claim, not a white-space claim. It's true, it's defensible in conversation, and it points at a real asset. It's also weaker as a moat — consolidation is exactly what incumbents ship next — which is why §1.2 matters.

**Action:** rewrite v1 §2 entirely. Keep the map, change the conclusion. Cite the proposal and legal-tech categories yourself, before someone else does. Being the person who mapped the market accurately is worth more to you right now than being the person who claimed an empty quadrant.

### 1.2 The moat argument is pointed at the wrong thing

v1 says context engineering is "a real moat if you get the context layer right." Context engineering is a *skill*. Skills aren't moats; they're table stakes that diffuse in about eighteen months.

The asset that compounds is **the accumulated deal record plus its outcomes**: which proposal language closed, which redline the counterparty accepted, which case study preceded a win. That data is per-customer, grows monotonically, and creates switching cost — and no point solution accumulates it because each one only sees its own slice.

This has a concrete design consequence you should adopt in Phase 0: **every generated artifact carries an outcome record**, and outcome capture is a required field, not an optional one. It costs you almost nothing now and it's the difference between "a tool that generates things" and "a system that learns from your deals." It also makes the dashboard layer meaningful, which brings us to:

### 1.3 Three things in v1 should be cut, and one should be promoted

**Cut — org usage dashboards.** They demonstrate nothing, they're the most-built thing in B2B software, and you have no org to measure. What you actually need from the "management surface" is the **trace view**: for a given generated artifact, which context files did the agent read, in what order, and what did it produce from them. v1 §3 already identifies this as "where trust is won or lost" and then buries it as one bullet under a pillar that's mostly dashboards. Invert that.

**Cut — the ten-skill library.** Ten skills at v1 is a portfolio, not a product. Five, done to depth, with evals, beats ten shallow ones — and the five are more impressive precisely *because* you can show they work.

**Cut — Phase 2/3 CRM integration as scoped.** v1 is right that deep bidirectional sync is a trap. But the fix it proposes ("thinnest possible interface at first") still leaves the context model unanchored. See §4.1: adopt CRM-shaped opportunity IDs as your primary key from day one, and defer the actual integration indefinitely. Cheap now, structurally expensive later.

**Promote — evaluation.** v1 has one soft success criterion ("the review flags the same issues a human would, with visible reasoning") and no mechanism behind it. For a credibility asset, the eval harness may be the single most impressive artifact in the repo. Almost nobody in AI sales tooling publishes evals. A golden set of deals, labeled expected findings, a scoring runner, and a pass rate that moves in CI on every PR — that is a stronger demonstration of AI-native competence than any feature you could build in the same time.

### 1.4 Two structural risks

**Liability inversion.** v1 puts SOW/MSA review first because you've built something like it before. Familiarity is a good reason to use it to *prove the context model privately* — it has crisp, checkable ground truth. It's a bad reason to make it the public centerpiece: it's the highest-liability, lowest-error-tolerance workflow in the set, and a solo builder demoing "my AI reviews your MSAs" invites the wrong questions. Make **call prep → call summary → proposal** the public spine. It's judgeable in ninety seconds and carries no exposure.

**Reuse entitlement.** Check what you're actually entitled to carry over from the Product School–era SOW review workflow, templates, and any deal material. The clean answer for a public repo is to rebuild from scratch against synthetic material and keep the old work entirely out of it. That's also faster than adjudicating it.

### 1.5 Positioning

> **Deal Desk** — the layer between "we have a meeting" and "we have signed paper."
>
> One context substrate per opportunity. Five agents that read it. Every artifact they produce cites the context it came from, and every one of them is scored against a golden set before it ships.

Drop "Agentic Sales Hub" as an external name. "Agentic" + "Hub" reads as 2024 vendor boilerplate and names the mechanism instead of the job. *Deal desk* is a term your buyer already uses, and it names the wedge.

---

## 2. Goals, non-goals, success criteria

### Goals

1. Demonstrate AI-native engineering competence in a way a hiring manager, prospective client, or investor can evaluate without your narration.
2. Build something you would actually use on your own deals.
3. Preserve commercial optionality — clean license, no third-party data, multi-tenant-shaped context model.

### Non-goals for v1 (say these out loud, they're what keeps the scope honest)

- Multi-tenant SaaS, auth beyond single user, billing.
- Bidirectional CRM sync of any kind.
- Usage/adoption dashboards.
- MSA generation, SOW generation, e-signature, proposal publishing/hosting.
- Mobile, real-time collaboration, notifications.
- Any claim that review output constitutes legal advice.

### Ship criteria — v1 is done when all six are true

1. A stranger clones the repo, follows the README, and produces a call-prep brief and a proposal draft against the synthetic corpus in **under 10 minutes**.
2. Every generated artifact carries a **citation map** — each material claim resolves to a context file and line range — and the trace viewer renders it.
3. The **eval suite runs in CI on every PR**, publishes a pass rate, and the rate is visible in the README badge and the eval board.
4. The **context spec is published** as a standalone document, independent of the implementation.
5. One written build log and one ≤5-minute demo video are published.
6. Nothing in the repository is anyone's confidential material.

---

## 3. User and job

**Single player.** One seller running 5–25 concurrent B2B opportunities where the deal has a services or blended license+services component — so proposals and SOWs are real work, not a price sheet. That's your own profile, which is the right choice: you can judge output quality without a research program.

Multi-tenancy is a **design constraint** (the context model must not assume one org), not a build item.

**The job:** convert scattered account context into the four artifacts that actually move a deal —

1. a call-prep brief grounded in real account context, not a template;
2. a call summary with commitments and next steps extracted;
3. a proposal draft built from what you sell, what you've promised, and what has worked before;
4. a risk read on the paper before it goes to legal.

---

## 4. Context model — the core IP

This is the part worth getting right and the part worth publishing separately. Everything else is application code.

### 4.1 Design rules

1. **The opportunity is the primary key, and its ID is CRM-shaped from day one.** Even in the synthetic corpus, mint IDs that look like Salesforce/HubSpot object IDs and record `crm_system` + `crm_id` in frontmatter. You will never do a big migration to add this, and without it the knowledge base orphans itself from the system of record.
2. **Everything is a file with typed frontmatter. Git is the store.** No database in v1. Files are diffable, reviewable, greppable by an agent, and they make the whole thing inspectable — which is the point.
3. **Two mutability classes.** *Canonical* context (org, legal, demand-gen) is replaced and versioned, and changes go through review. *Accumulating* context (account, opportunity) is **append-only** — a meeting note is never rewritten, a superseded proposal is marked superseded, not deleted. The audit trail is the product.
4. **Provenance is mandatory.** No claim without a citation. A generation skill that can't cite a source for a material assertion must mark it `[unsourced]` in the draft rather than assert it. This single rule is most of the trust story.
5. **Outcomes are first-class.** Every generated artifact gets an outcome record (`sent`, `won`, `lost`, `redline_accepted`, `redline_rejected`, `superseded`, `unused`) with a date. Unfilled outcomes are a tracked metric.
6. **Context grants are declared and enforced.** Each skill declares the read scopes it needs. The loader refuses reads outside them. `call-prep` has no business reading legal templates; `sow-review` has no business writing anything.

### 4.2 Layout

```
context/
├─ schema/                          # JSON Schema for every frontmatter type — the published spec
├─ org/
│  ├─ company.md                    # who we are, mission, positioning
│  ├─ offerings/<offering>.md       # what we sell, scope boundaries
│  ├─ pricing.md                    # rate card, discount authority, floors
│  └─ evidence/<case-study>.md      # case studies, references, proof points
├─ demand-gen/
│  ├─ icp/account.md, icp/buyer.md
│  ├─ campaigns/<campaign>.md
│  └─ events/<event>.md
├─ legal/
│  ├─ guidance.md                   # positions, red lines, fallback ladder
│  ├─ templates/msa.md, templates/sow.md
│  └─ clause-library/<clause>.md    # preferred / acceptable / unacceptable, with rationale
└─ accounts/
   └─ <account-slug>/
      ├─ account.md                 # firmographics, structure, history
      ├─ people/<person>.md         # role, disposition, quotes
      ├─ research/<note>.md
      └─ opportunities/
         └─ <crm-opportunity-id>/
            ├─ opportunity.md       # stage, amount, dates, competitive context
            ├─ meetings/<date>-<type>.md        # append-only
            ├─ artifacts/<id>-<kind>.md         # generated: brief, summary, proposal, findings
            ├─ inbound/<date>-<doc>.md          # counterparty-supplied — UNTRUSTED (see §9)
            └─ outcomes.jsonl                   # append-only outcome records
```

**Why the nesting matters:** it makes the retrieval scope for any skill computable rather than semantic. `call-prep` for opportunity `006Ax…` reads exactly `org/**`, `demand-gen/icp/**`, and `accounts/<acct>/**` for that account — no vector search required to be correct. Semantic retrieval is a *ranking* layer inside a scope, never the scope itself. This is the biggest single reliability advantage you have over a general-purpose RAG approach, and it's worth saying out loud in the writeup.

---

## 5. Skill contracts

### 5.1 Three tiers, three contracts

v1 correctly split generation from review. There's a third: retrieval.

| Tier | Job | Output contract | How it's evaluated |
|---|---|---|---|
| **Retrieval** | Find and rank context | Ranked list of `{path, span, relevance, why}` | Precision/recall against labeled relevant spans |
| **Generation** | Synthesize context into a new artifact | Artifact (markdown) **+ citation map** + `[unsourced]` markers | Rubric scoring + citation validity (every citation resolves and supports its claim) |
| **Review** | Check a draft against canonical context | **Structured findings only** — never prose | Recall/precision against labeled findings in golden documents |

The review contract, concretely:

```json
{
  "finding_id": "f-014",
  "document": "inbound/2026-10-02-acme-msa-redline.md",
  "locator": {"clause": "9.3", "span": [412, 587]},
  "issue": "Uncapped indemnity for IP infringement",
  "severity": "blocker",
  "position": "unacceptable",
  "citation": {"path": "context/legal/clause-library/indemnity.md", "span": [22, 41]},
  "suggested_redline": "…",
  "confidence": 0.86
}
```

Structured findings are what make review skills testable, aggregatable, and safe to render in a UI. Prose review output is untestable and it's the reason most "AI contract review" demos don't survive contact with a real redline.

### 5.2 The v1 skill set — five, not ten

| Skill | Tier | Scope | Ships in |
|---|---|---|---|
| `find-evidence` | Retrieval | Case studies, prior proposals, prior wins matching a described situation | Phase 0 |
| `sow-review` | Review | SOW draft vs. legal guidance + clause library | Phase 0 (private proof) |
| `call-prep` | Generation | Account + people + prior meetings + ICP + offerings → brief | Phase 1 |
| `call-summary` | Generation | Raw notes/transcript → summary, commitments, next steps, context deltas | Phase 1 |
| `proposal-draft` | Generation | Opportunity + offerings + pricing + evidence + commitments → proposal | Phase 1 |

**Deferred to roadmap, explicitly:** `msa-review`, `msa-create`, `sow-create`, `proposal-scratch`, `publish-proposal`, `case-study-generate`. Name them in the README as roadmap so the restraint reads as judgment rather than as an unfinished list.

### 5.3 Skill definition shape

```yaml
id: call-prep
tier: generation
version: 3
context_grants:
  read: [org/**, demand-gen/icp/**, accounts/{account}/**]
  write: [accounts/{account}/opportunities/{opp}/artifacts/**]
inputs:
  opportunity_id: {type: string, required: true}
  meeting_type: {enum: [discovery, demo, negotiation, qbr]}
output:
  schema: schemas/call-prep-brief.json
  requires_citations: true
eval_suite: evals/cases/call-prep/
tools: [context.read, context.search, artifact.write]
```

The skill definition is **data**, not prose, so the same file drives the Claude Code skill, the MCP tool, and the eval runner. One definition, three consumers — that's the piece worth showing people.

---

## 6. Architecture

Three layers, and one sentence that kills v1's open question #2:

> **Claude Code is the development environment. The Claude Agent SDK is the runtime. MCP is the interface between the agent core and everything else.** It was never either/or.

```
┌──────────────────────────────────────────────────────────────┐
│  Surfaces                                                    │
│  • Claude Code / Cowork / desktop  ── via MCP                │
│  • Thin web surface (Next.js)      ── via Agent SDK          │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  packages/mcp-deal-desk   — MCP server                       │
│    tools: context.read · context.search · artifact.write     │
│           skill.run · trace.get                              │
│    enforces context grants, emits traces                     │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  packages/context-core    — loader, schema validation,       │
│    scope resolution, provenance, append-only enforcement,    │
│    outcome records                                           │
│  packages/skills          — skill definitions (data)         │
│  evals/                   — golden set + runner + scorers    │
└──────────────────────────────────────────────────────────────┘
```

**Why the MCP server is the strategic piece:** it's the distribution channel. Anyone with Claude can point `mcp-deal-desk` at their own `context/` directory and get the whole thing, with zero hosting, zero signup, zero data leaving their machine. For a credibility asset that is worth more than a hosted app with three users — and if you ever do want a commercial product, "already installed" is a much better starting position than "please create an account."

---

## 7. The thin surface — three screens, no more

1. **Context editor** — browse and edit the context tree with schema validation. Enough that a non-technical person doesn't have to touch a text editor. Writes go through git.
2. **Trace viewer** — the important one. For any artifact: what the agent read, in what order, what it produced, which claims are cited vs. `[unsourced]`, the token/time cost, and a diff against the previous version. *This is what you demo.*
3. **Eval board** — pass rate over time, per skill, per case; the cases that regressed on the last run; a link to the PR that moved the line.

There is deliberately no dashboard, no pipeline view, no CRM mirror. If someone asks where the dashboards are, "the CRM already has them" is the correct answer and a good one.

---

## 8. Evaluation strategy

This is new relative to v1 and it is the highest-leverage addition in this spec.

**Golden set.** Inside the synthetic corpus: 4 opportunities, ~12 meeting notes, 3 case studies, 2 counterparty redlines with **labeled findings** (every issue a competent reviewer should catch, with severity), and 3 reference proposals with rubric scores.

**Three eval classes.**

| Class | Metric | Gate |
|---|---|---|
| Retrieval | Precision@5, recall of labeled relevant spans | Recall ≥ 0.90 on required spans |
| Generation | LLM-judge rubric (grounding, completeness, tone, structure) + **citation validity** — every citation resolves and supports its claim | Citation validity = 1.00; rubric ≥ 4.0/5 |
| Review | Finding recall / precision vs. labeled findings, weighted by severity | **Blocker recall = 1.00**; precision ≥ 0.70 |

**Blocker recall of 1.00 is the one non-negotiable gate.** A contract reviewer that misses an uncapped indemnity is worse than no reviewer, because it manufactures false confidence. Say that in the README; it's the sentence that tells a reader you've thought about this seriously.

**Where it runs.** In CI on every PR (§ SDLC doc), plus a nightly full run. Results committed to `evals/results/` so the history is in git and the eval board reads from it.

---

## 9. Trust and security

**Prompt injection through counterparty documents.** This is a real, product-specific attack surface and it's worth naming as a designed control rather than a footnote. `inbound/` holds documents supplied by the other side of a negotiation — an MSA redline from opposing counsel is untrusted input flowing into an agent that has file-write access.

Controls:
- `inbound/**` is **read-only, quarantined, and wrapped**: content is passed to the model inside explicit untrusted-content delimiters with a standing instruction that it is data, never instruction.
- Review skills have **no write grant at all** — they return findings; a separate step persists them.
- A hook blocks any tool call whose arguments originate from `inbound/**` content.
- Every `inbound/**` ingestion is logged in the trace with a hash of the source.

Getting this right, and writing 400 words about it, differentiates you from every proposal-bot demo on the internet.

**Other controls.**
- **No real third-party data in the repo, ever.** Enforced by a CI check that fails on anything outside the synthetic corpus namespace in `context/accounts/`.
- Secret scanning + `gitleaks` in CI.
- Review outputs carry a standing disclaimer: risk flags for a human reviewer, not legal advice.
- Least-privilege context grants, enforced at the loader, not by prompt.

---

## 10. The synthetic corpus — a first-class deliverable

Budget **a full day** for this. Its quality determines whether the demo persuades.

**The fabricated company.** A mid-market B2B company selling a platform with a meaningful services attach — the shape that makes SOWs and proposals real work. Give it a rate card, discount authority, three case studies, an MSA and SOW template with genuinely opinionated clause positions, and a clause library with rationale.

**Four opportunities at different stages**, so the demo can show the same context model at first-call, mid-cycle, proposal, and paper stages. Twelve meeting notes across them, written in the messy register real notes are actually written in — fragments, half-sentences, contradictions between calls. Clean notes make the demo easy and unconvincing.

**Two counterparty redlines** with labeled findings, one of which contains a deliberate prompt-injection attempt, so you can demo the control from §9 working.

**Rules:** obviously fictional company and person names; no real logos, trademarks, or wordmarks; no real company's terms copied; a `FICTIONAL` banner in every file's frontmatter and a `CORPUS.md` at the root stating plainly that nothing in it describes a real organization. This protects you and it costs nothing.

---

## 11. Phasing — Q4 2026 at ~30 hrs/week

| Phase | Dates | Deliverable | Done when |
|---|---|---|---|
| **0 — Substrate** | Sep 8 – Sep 19 | Context schema, synthetic corpus v1, `context-core`, `find-evidence` + `sow-review`, eval harness with the golden set | `sow-review` hits blocker recall 1.00 on both labeled redlines, with citations, and the eval runs in CI |
| **1 — Deal spine** | Sep 22 – Oct 24 | `call-prep`, `call-summary`, `proposal-draft`; `mcp-deal-desk` server; trace emission; outcome records | You can run a full deal end-to-end in Claude Code against the corpus, and every artifact cites its sources |
| **2 — Surface** | Oct 27 – Nov 21 | Next.js surface: context editor, trace viewer, eval board. Agent SDK runtime behind it. Injection controls implemented and tested | A stranger can drive the whole thing from the browser and see *why* each artifact says what it says |
| **3 — Publish** | Nov 24 – Dec 19 | Public repo, README, context spec as a standalone doc, build log series, ≤5-min demo, packaged MCP server | All six ship criteria in §2 are true |

**Reserve ~20% of hours for the writeup and demo, from Phase 0 onward, not at the end.** For a credibility asset, distribution is not a follow-on task — it's half the deliverable. v1 contains zero distribution plan; that's the largest gap in it after the market claim. Write the build log as you go; it's also the most reusable thing you'll produce.

---

## 12. Open decisions that actually remain

1. **Public repo from day one, or at Phase 3?** Recommendation: public from day one. The commit history *is* the AI-SDLC demonstration, and a repo that appears fully formed in December demonstrates less than one you can watch develop.
2. **License.** MIT on the context spec and MCP server (maximizes adoption and inbound); source-available or private on the surface if you want commercial optionality. Decide before the first public push, not after.
3. **Does the private validation pass happen at all?** Running it against your own live material is valuable but slow, and your pipeline may not exercise SOW/MSA at all. If it won't, say so and lean entirely on the corpus — a synthetic corpus you've engineered to be hard is more rigorous than three real deals you got lucky on.
4. **Sequencing of the long autonomous build session.** v1 §6.3 proposes using a long-horizon model to scaffold the skill library and context schema in one push. Right tool, wrong moment — that run should come *after* the eval harness exists in Phase 0, so it can verify its own output. Scaffolding before evals is how you get 4,000 lines of plausible, unverifiable code. See the SDLC framework doc, §7.
5. **When does "product" get revisited?** Set the trigger now: *three people who aren't you have run it on their own context and come back with a feature request.* Until that happens, it's a credibility asset, and that's fine.

---

*Companion document: `AgenticSalesHub_AI-SDLC-Framework_v1.md` — how this gets built.*
