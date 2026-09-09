# **AI-Native SDLC — Framework and Implementation (v1)**

Anthropic's AI-Native SDLC playbook, adapted for a single builder with heavy GitHub automation.

### The two nested lifecycles

This project has an unusual property worth exploiting: **the product ships agent configuration**. So there are two lifecycles running in the same repo.

|  | Lifecycle A — the code | Lifecycle B — the agent config |
| :---- | :---- | :---- |
| Artifacts | TypeScript, Next.js, MCP server | Skill definitions, prompts, context schema, `CLAUDE.md`, hooks |
| Verified by | Unit \+ integration tests, typecheck, build | The **eval suite** (`evals/`) |
| Regression looks like | A test goes red | A pass rate drops 4 points |
| Gate | CI green | Eval gates in §8 |

Most teams only have A. You have both, and B is the interesting one. Treat agent configuration as code that requires regression testing — Anthropic's playbook calls this out explicitly at the Test stage, and it is exactly where your product and your process coincide.

---

## *1\. Principles*

Six, adapted from the playbook for a solo operator.

1. **Every stage commits an artifact the next stage reads.** intent → spec → plan → diff \+ tests → review findings → eval/incident record. Together they are the audit trail, and they live in git, timestamped and attributed. This is the spine of the whole thing.  
2. **Solo means time-separation, not role-separation.** In a team, the value of the artifact chain is handoff. Alone, its value is *honesty across time*: you are the product owner on Monday and the reviewer on Thursday, and the written spec is what stops Thursday-you from rubber-stamping Monday-you. If you find yourself approving your own plan without reading it, the process has already failed.  
3. **Never let an agent write code it can't verify.** Tests, a build, a screenshot diff, an eval score — something. This is the single highest-leverage rule in the playbook and the one that makes autonomous runs safe.  
4. **Claude reviews everything inbound; you review everything Claude authored.** Automated review runs first and mechanically; your attention goes to intent and risk, not to catching a missing null check.  
5. **Advisory guidance goes in skills; enforcement goes in hooks.** A `CLAUDE.md` rule is a suggestion. A hook is a control. Anything that must not happen — writing to `context/legal/**`, editing the golden eval set, merging to main — gets a hook, not a paragraph.  
6. **Tier the ceremony.** Full artifact chain on every typo is how a solo process dies in week three. §3 tiers it.

---

## *2\. Stage map*

| Stage | Artifact | Who decides | Where it lives |
| :---- | :---- | :---- | :---- |
| **Plan** | `intent.md` | You (product owner hat) | `docs/intents/NNN-slug.md`, opened as a GitHub Issue |
| **Design** | `spec.md` | Claude drafts, you approve | `docs/specs/NNN-slug.md` |
| **Build** | `plan.md` \+ diff | Claude in plan mode, you approve | `docs/plans/NNN-slug.md`, then a PR |
| **Test** | tests \+ eval results | Claude iterates until green | `evals/results/`, CI |
| **Deploy** | review findings | Claude reviews, you merge | PR comments, `REVIEW.md` policy |
| **Maintain** | eval regressions, incident records | Detection scripts trigger Claude | New Issues, back to Plan |

The loop closes: a nightly eval regression writes a new `intent.md` and re-enters at stage 1 without you initiating it.

---

## *3\. Work tiers — how much ceremony for what*

| Tier | Examples | Artifacts required | Path |
| :---- | :---- | :---- | :---- |
| **T0 — Chore** | Dep bump, typo, formatting, test flake | None | Direct PR, CI must pass, self-merge |
| **T1 — Feature** | A new eval case, a UI screen, a bug fix | `plan.md` only | Issue → plan mode → PR → Claude review → you merge |
| **T2 — Capability** | A new skill, a context schema change, an architectural decision | `intent.md` → `spec.md` → `plan.md` | Full chain, all three committed before code |

**Rule:** anything that changes the **context schema**, a **skill contract**, or an **eval gate** is automatically T2, no exceptions. Those three are the load-bearing surfaces of the product; everything else is replaceable.

Label issues `tier:0` / `tier:1` / `tier:2` and let the workflows branch on it.

---

## *4\. Repository layout*

One monorepo. The SDLC scaffolding is visible at the top level on purpose — a visitor should see the process before they see the code.

agentic-sales-hub/

├─ CLAUDE.md                     \# conventions, commands, architecture, recurring mistakes  
├─ REVIEW.md                     \# PR review policy \+ severity definitions  
├─ CORPUS.md                     \# states plainly that all data is fictional  
├─ .claude/  
│  ├─ settings.json              \# permissions, model defaults  
│  ├─ skills/                    \# PRODUCT skills (shipped) \+ dev skills  
│  │  ├─ call-prep/  call-summary/  proposal-draft/  sow-review/  find-evidence/  
│  │  ├─ write-intent/           \# dev skill: interview → intent.md  
│  │  ├─ write-spec/             \# dev skill: intent.md → spec.md against policy  
│  │  └─ night-shift/            \# dev skill: autonomous overnight loop  
│  ├─ agents/                    \# subagents  
│  │  ├─ verifier.md             \# runs tests/build/evals, reports, does not edit  
│  │  ├─ eval-runner.md  
│  │  ├─ context-auditor.md      \# checks citation validity \+ grant violations  
│  │  └─ security-reviewer.md    \# injection surface, secrets, grant escalation  
│  └─ hooks/  
│     ├─ protect-paths.sh        \# block writes to legal templates \+ golden evals  
│     ├─ quarantine-inbound.sh   \# block tool calls sourced from inbound/\*\*  
│     └─ format-on-write.sh  
├─ .github/  
│  ├─ workflows/                 \# §6  
│  ├─ ISSUE\_TEMPLATE/            \# intent.yml · bug.yml · eval-regression.yml  
│  ├─ pull\_request\_template.md  
│  └─ CODEOWNERS  
├─ docs/  
│  ├─ sdlc/                      \# THIS document, published  
│  ├─ intents/  specs/  plans/   \# the artifact chain  
│  └─ decisions/                 \# ADRs for irreversible calls  
├─ context/                      \# the substrate \+ synthetic corpus (see spec §4)  
├─ packages/                     \# context-core · mcp-agentic-sales-hub · skills  
├─ apps/surface/                 \# thin Next.js surface  
└─ evals/                        \# golden/ · cases/ · runner/ · results/   
---

## *5\. Stage-by-stage practice*

### 5.1 Plan → `intent.md`

Open a GitHub Issue from the `intent.yml` template. Then run the `write-intent` dev skill in Claude Code: you describe the problem in your own words, Claude interviews you and synthesizes it.

`intent.md` contains: problem, proposed outcome, who it affects, constraints, open questions, and **how we'll know it worked**. That last field is the one people skip and the one that makes the rest testable.

**Solo discipline:** write the intent, then close the laptop. Approve it in a separate session. If it still makes sense cold, it's real.

### 5.2 Design → `spec.md`

The `write-spec` skill takes `intent.md` and produces `spec.md` under standing policy: the context-model rules, the skill contract shape, the security constraints, the non-goals. You review for *conflicts and omissions*, not for prose — Claude writes the spec, you flag where it violated a constraint you care about.

Both files are committed on a branch and merged before any code exists. That merge is the design gate.

### 5.3 Build → `plan.md` \+ diff

Start in **plan mode** (read-only). Claude explores the repo and interviews you about approach before writing anything. The approved plan is committed as `docs/plans/NNN-slug.md`, then implementation begins.

**Parallelism.** At 30 hrs/week you should be running 2–4 concurrent workstreams in separate **git worktrees** — one per T1/T2 issue. Rules that make this survivable:

- One worktree per issue, named for the branch. Never two agents in one tree.  
- Every worktree stays green independently; rebase on main daily, not at merge time.  
- Schema and skill-contract changes get a **worktree lock** — nothing else runs while one is in flight, because everything depends on them.  
- The `verifier` subagent runs the test/build/eval loop so the main session's context isn't consumed by test output.

**`CLAUDE.md` is the compounding asset here.** Every time you correct Claude on the same thing twice, that correction goes in `CLAUDE.md`. Keep it tight — it's read on every run, so it's a budget, not a wiki.

### 5.4 Test → verification loops

Claude iterates against real signals before you see the work: `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm eval --suite <skill>`. Nothing reaches review red.

**Evals are the distinguishing part.** Any PR touching `.claude/skills/**`, `packages/skills/**`, `context/schema/**`, or `CLAUDE.md` triggers the eval suite. Gates from the spec:

- Citation validity \= 1.00 (every citation resolves and supports its claim)  
- Blocker recall \= 1.00 on review skills  
- Retrieval recall ≥ 0.90 on required spans  
- Generation rubric ≥ 4.0/5  
- **No net regression** vs. the last committed result on any suite

Results are committed to `evals/results/<date>-<sha>.json`, so the eval board and the README badge read from git history.

**Every production defect becomes a permanent eval case.** When a skill produces something wrong, the fix PR must include the case that would have caught it. This is the mechanism by which the system gets monotonically better instead of oscillating.

### 5.5 Deploy → review, then merge

Claude reviews every PR against `REVIEW.md` and posts inline comments. `REVIEW.md` defines severity and what to check:

\# Review policy

\#\# Severity

\- blocker: data loss, secret exposure, context-grant escalation,

           injection surface, eval gate bypass, real data in repo

\- major:   correctness bug, missing test for changed behavior,

           unvalidated schema change, uncited claim in a generation skill

\- minor:   naming, structure, duplication

\#\# Always check

1\. Does any skill read outside its declared context grants?

2\. Does any generation path emit a claim without a citation?

3\. Does anything write to context/legal/\*\* or evals/golden/\*\*?

4\. Is any content from inbound/\*\* reaching a tool call argument?

5\. Does the change require a new eval case? If yes, is it here?

Then **you** review — intent and risk only — and merge. On agent-authored PRs your review is the real gate, so it is never optional, and never at 1am.

### 5.6 Maintain → the loop closes

A nightly job runs the full eval suite and a set of deterministic detection scripts (eval pass rate, citation validity, token cost per skill run, corpus schema validity). When a control band breaches, Claude diagnoses it and **writes an `intent.md`**, which opens as an Issue and re-enters at stage 1\. Small fixes go straight to a PR labeled `tier:0`; anything structural waits for you.

That is the whole loop: it produces work for itself without you starting it, and every piece of that work still passes through your merge.

---

## *6\. GitHub integration — the concrete build*

### 6.1 Setup

gh auth login

claude                       \# in the repo

/install-github-app

This installs the Claude GitHub App, stores your credential as a repository secret, and opens a PR with the workflow files. Authenticate with **`CLAUDE_CODE_OAUTH_TOKEN`** (from `claude setup-token`) rather than an API key — it bills against your subscription rather than metered API usage, which matters a lot once nightly runs are on. Note it's tied to your account, which is fine for a solo project.

### 6.2 Labels

| Label | Meaning |
| :---- | :---- |
| `intent` | Has a committed `intent.md` |
| `tier:0` `tier:1` `tier:2` | Ceremony level (§3) |
| `agent-ready` | Spec/plan sufficient for Claude to implement unattended |
| `overnight` | Eligible for the nightly autonomous run |
| `eval-regression` | Opened by the nightly detector |
| `human-only` | Explicitly not for agents (security-sensitive, irreversible) |

### 6.3 Workflows

**A. `claude.yml` — interactive `@claude`** (from `/install-github-app`; the generated file is fine as-is). Mention `@claude` in any issue or PR comment and it works the issue.

**B. `claude-review.yml` — automated review on every PR**

name: Claude Review

on:

  pull\_request:

    types: \[opened, synchronize, ready\_for\_review, reopened\]

jobs:

  review:

    runs-on: ubuntu-latest

    permissions:

      contents: read

      pull-requests: read

      issues: read

      id-token: write

    steps:

      \- uses: actions/checkout@v6

        with: {fetch-depth: 1}

      \- uses: anthropics/claude-code-action@v1

        with:

          claude\_code\_oauth\_token: ${{ secrets.CLAUDE\_CODE\_OAUTH\_TOKEN }}

          plugin\_marketplaces: "https://github.com/anthropics/claude-code.git"

          plugins: "code-review@claude-code-plugins"

          prompt: "/code-review:code-review \--comment ${{ github.repository }}/pull/${{ github.event.pull\_request.number }}"

          claude\_args: '--allowedTools "mcp\_\_github\_inline\_comment\_\_create\_inline\_comment"'

Two lines carry the weight: `--comment` makes Claude post the review on the PR instead of only into the run log, and the `--allowedTools` in `claude_args` is what actually starts the inline-comment MCP server. Omit either and reviews vanish into the logs.

**C. `ci.yml`** — typecheck, lint, unit tests, build, `gitleaks`, and two project-specific checks: **corpus schema validation** and a **no-real-data check** that fails on any account slug outside the synthetic namespace.

**D. `evals.yml`** — runs on PRs touching skills, schema, or `CLAUDE.md`, and nightly in full. Posts a comparison comment (this run vs. main) and fails on gate breach or net regression.

**E. `night-shift.yml` — the autonomous overnight run** (§7).

### 6.4 Branch protection

Solo, so this is about forcing your own work through the loop rather than about other people:

- No direct pushes to `main`; everything through a PR.  
- Required status checks: `ci`, `evals`, `claude-review`.  
- `CODEOWNERS` assigns you everything — the point is that agent PRs always land in your queue.  
- Linear history; squash merges. The commit log should read as the project's narrative, because people will read it.

### 6.5 Five gotchas that will cost you an evening each

1. **CI doesn't run on Claude's commits** if you pass `github_token: ${{ secrets.GITHUB_TOKEN }}`. Omit it so the action authenticates as the Claude GitHub App, or use a custom app token. Otherwise agent PRs sit with no checks and you won't understand why.  
2. **Scheduled runs are attributed to whoever last edited the cron line.** The action rejects bot actors unless listed in `allowed_bots`. If a bot ever touches that line, nightly runs stop silently.  
3. **Schedules only run from the default branch**, and on public repos GitHub disables them after 60 days without repository activity.  
4. **Automation mode has no tools by default.** With a `prompt` input and plain text, Claude has no shell or GitHub access until you grant it via `--allowedTools` or a `permissions.allow` rule in `settings`. Invoking a skill instead lets the skill's `allowed-tools` frontmatter carry the grants — cleaner, and the pattern to prefer.  
5. **Fork PRs on public repos don't get secrets**, so review won't run on outside contributions. Expected; don't debug it.

### 6.6 Cost control

`--max-turns` on every automation-mode workflow, job-level `timeout-minutes`, `concurrency` groups to prevent pile-ups, and a keep-it-short `CLAUDE.md` since it's read on every run. Track spend weekly in the Friday review; if nightly runs are the biggest line item and aren't producing merged PRs, cut their scope rather than their frequency.

---

## *7\. The overnight autonomous loop*

You already run this pattern with NightShift. Port it, with three changes that matter.

name: Night Shift

on:

  schedule:

    \- cron: "0 6 \* \* 2-6"        \# 02:00 ET, Mon–Fri nights

  workflow\_dispatch:

jobs:

  night-shift:

    runs-on: ubuntu-latest

    timeout-minutes: 90

    concurrency: {group: night-shift, cancel-in-progress: false}

    permissions:

      contents: write

      pull-requests: write

      issues: write

      id-token: write

      actions: read

    steps:

      \- uses: actions/checkout@v6

      \- uses: anthropics/claude-code-action@v1

        with:

          claude\_code\_oauth\_token: ${{ secrets.CLAUDE\_CODE\_OAUTH\_TOKEN }}

          prompt: "/night-shift"

          claude\_args: |

            \--max-turns 60

            \--model \<pin the current Opus model id\>

Pin an explicit model id rather than relying on the default, so a nightly run's behavior doesn't shift under you when the default changes; bump it deliberately and note the change in the eval results.

The `night-shift` skill's own `allowed-tools` frontmatter grants what it needs (`Bash(gh:*)`, `Bash(pnpm:*)`, Read/Write/Edit), so the workflow stays declarative.

**The skill's loop:** pick the highest-priority open issue labeled `overnight` \+ `agent-ready` and not `human-only` → read its `spec.md`/`plan.md` → implement on a branch → run typecheck, tests, build, and the relevant eval suite → **only open a PR if everything is green**; otherwise comment on the issue with the diagnosis and stop → one issue per run.

**The three changes from a generic overnight pipeline:**

1. **Evals before autonomy.** The v1 plan proposed a long autonomous session to scaffold the skill library and context schema. Right tool, wrong moment: an autonomous run is only as safe as its verification loop, so it belongs *after* the Phase 0 eval harness exists. Scaffolding before evals produces a large volume of plausible, unverifiable code — the most expensive kind to review.  
2. **Green-or-silent.** A failed run must not open a PR. Overnight runs earn their keep by being a queue you trust; the moment they produce work you have to triage, they cost more than they save.  
3. **Eligibility is explicit.** `agent-ready` is a label you apply after reading the plan. Nothing is autonomous by default. `human-only` covers anything touching security controls, the injection quarantine, or irreversible operations.

**A second nightly job — the detector** — runs the full eval suite plus the control-band scripts and, on breach, opens an `eval-regression` issue containing a drafted `intent.md`. That's the maintain-stage loop from §5.6, and it's the thing that makes the system feel alive when you demo it.

---

## *8\. Metrics*

Solo-adapted from the playbook's leading/lagging split. Compute weekly from GitHub and eval history; render them on the eval board.

**Leading**

| Metric | Why | Target |
| :---- | :---- | :---- |
| Idea → committed `intent.md` | Is planning a bottleneck? | \< 2 hours |
| Spec → plan elapsed | Is design stalling? | \< 1 day |
| First-pass CI success rate | Quality of agent output | \> 70% |
| Concurrent worktrees in flight | Are you actually parallelizing? | 2–4 |
| Overnight PRs opened / merged | Is autonomy earning its keep? | \> 60% merged |
| Eval suite runtime | Is verification still fast enough to run every time? | \< 10 min |

**Lagging**

| Metric | Why |
| :---- | :---- |
| Eval pass rate over time, per suite | The product's actual quality curve |
| % of agent-authored PRs merged without human edits | Trust, measured |
| Rework rate (PRs reopened / reverted) | Where planning is too thin |
| Defects escaping to a demo despite review | The one that hurts, and the one that generates eval cases |
| `intent.md` survival rate (opened → shipped) | Are you planning things you don't build? |

The eval pass rate over time is the chart to publish. It's the single most legible proof that you built a system that measures itself.

---

## *9\. Weekly operating cadence*

At \~30 hrs/week, with nightly runs doing work while you sleep:

|  | Focus |
| :---- | :---- |
| **Mon AM** | Product-owner hat. Triage overnight PRs and eval regressions. Write/approve intents and specs for the week. No coding. |
| **Mon PM – Thu** | Build. 2–4 worktrees. Plan mode → implement → verify → PR. Review Claude's review, then merge. |
| **Thu PM** | Agent-config session: what did Claude get wrong repeatedly this week? Update `CLAUDE.md`, skills, and hooks. Add eval cases for every mistake. |
| **Fri AM** | Metrics \+ cost review. Update the eval board. Label next week's `overnight` \+ `agent-ready` queue. |
| **Fri PM** | Write. Build-log post, README updates, demo script. Non-negotiable — this is 20% of the deliverable, not overflow work. |
| **Nightly** | Night Shift \+ detector. |

---

## *10\. Rollout*

**Week 1 (Sep 8–12) — scaffold the process before the product.** Repo \+ monorepo skeleton; `CLAUDE.md`, `REVIEW.md`, `CORPUS.md`; `/install-github-app`; `claude.yml` \+ `claude-review.yml`; `ci.yml` with typecheck/test/build/gitleaks; labels, issue templates, branch protection; `docs/sdlc/` with this document. Then use the process for its own first real change, so the chain is exercised before it matters.

**Week 2 (Sep 15–19) — verification.** `evals/` runner and golden set; `evals.yml`; the `verifier` and `eval-runner` subagents; the protect-paths and quarantine hooks. Only now does the first product capability (T2: context schema \+ `sow-review`) go through the full chain.

**Week 3+ — turn on autonomy.** `night-shift.yml` and the detector, once the eval suite is trustworthy. Start with one issue per night and `--max-turns 40`; widen only after a week of ≥60% merge rate.

**Ongoing:** every repeated correction → `CLAUDE.md`. Every defect → an eval case. Every irreversible decision → an ADR in `docs/decisions/`.

---

## *11\. Failure modes, and the control for each*

| Failure mode | What it looks like | Control |
| :---- | :---- | :---- |
| **Rubber-stamping yourself** | You approve your own specs in the same session you wrote them | Time-separation rule (§1.2); approve in a later session |
| **Ceremony collapse** | By week 3 you're pushing to main and skipping intents | Branch protection makes it structurally impossible, not merely discouraged |
| **Eval theater** | Suite is green because the cases are easy | Every defect adds a case; review the golden set monthly and deliberately add cases you expect to fail |
| **Autonomy debt** | Overnight PRs pile up unreviewed | Green-or-silent \+ a hard rule: unmerged overnight PRs older than 48h get closed, not carried |
| **Context rot** | `CLAUDE.md` grows to 2,000 lines and quality drops | Budget it: ≤150 lines. Anything longer becomes a skill |
| **The demo drifts from the repo** | The video shows something the code no longer does | Demo script lives in the repo and is exercised by an eval case |
| **Prompt injection via corpus** | A counterparty doc steers an agent | Quarantine hook \+ no-write review skills \+ a deliberate injection case in the golden set |
| **Process as procrastination** | Three weeks of beautiful scaffolding, no product | Week 1 is capped at one week. If the process isn't producing merged product PRs by Sep 19, cut it back |

That last row is the real risk for this document. The framework is worth building because it *is* part of the deliverable — but it earns that only if it's shipping product code by the end of Phase 0\.

---

## *Sources*

- [The AI-Native SDLC playbook — Anthropic](https://claude.com/blog/the-ai-native-sdlc-playbook)  
- [How Anthropic secures its AI-native software development lifecycle](https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle)  
- [Claude Code GitHub Actions — documentation](https://code.claude.com/docs/en/github-actions)  
- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)

