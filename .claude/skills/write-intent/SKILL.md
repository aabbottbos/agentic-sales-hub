---
name: write-intent
description: Turn a rough problem — spoken by the user, or already sketched in a GitHub Issue opened from intent.yml — into a committed docs/intents/NNN-slug.md. Use at the start of the Plan stage for any tier:1 or tier:2 issue. Not for tier:0 chores, which skip the intent stage entirely.
---

# Write Intent

You are running the Plan stage of the deal-desk SDLC. Your job is to take whatever the user gives you — a few spoken sentences, or a GitHub Issue opened from `.github/ISSUE_TEMPLATE/intent.yml` — and turn it into a complete, committed `intent.md`. You interview; the user answers; you synthesize. You do not invent the problem, the outcome, or the success criteria — those come from the user. You're responsible for structure, precision, and catching gaps.

## Step 1 — Find out what you're starting from

Ask, or infer from context, whether there's already a GitHub Issue for this (a number or URL). If there is:

- Fetch it (`gh issue view <number>`).
- It should already have tier, problem, proposed outcome, who it affects, and (optionally) constraints and open questions from the form. Treat those as a first draft, not a final answer — every field from a form is usually thinner than it needs to be.

If there's no issue yet, work from whatever the user just told you and plan to open the issue yourself once the intent is drafted (see Step 5).

## Step 2 — Interview until every field is real

Work through these six fields. For each one, if the existing answer (from the issue or from what the user just said) is already concrete and testable, confirm it back to them in one line and move on — don't re-ask what's already answered well. If it's thin, vague, or missing, ask a sharper follow-up. One question at a time; don't batch them.

1. **Problem** — What's actually broken or costing time? Push for a concrete trigger ("stale account context by the time the rep is in the room"), not a category ("context management is hard").
2. **Proposed outcome** — What does the world look like once this ships? Should be a state, not a task list.
3. **Who it affects** — Which skills, surfaces, or people touch this. If the answer is "everyone," push back — that's usually a sign the intent is too broad and should be split.
4. **Constraints** — Known limits: technical, time, budget, or policy (context grants, eval gates, the tier-2 trigger list). Okay to leave thin if genuinely none.
5. **Open questions** — What's unresolved that the spec stage needs to settle. A real intent almost always has at least one; if the user says "none," ask once more before accepting it.
6. **Success criteria ("how we'll know it worked")** — This is the field people skip and the one that makes the rest testable. Reject vibes ("it should feel better"). Push for a metric, an eval gate, or a concrete observable ("citation validity stays 1.00 and retrieval recall on call-prep rises to ≥0.90"). Do not let this field go to draft without a checkable answer.

## Step 3 — Confirm the tier

If the issue already has a tier label (`tier:1` / `tier:2`), state it back and ask if it still holds now that the problem is fully drawn out. If not yet set, apply the rule from the SDLC doc without asking permission to apply it — just flag it:

> Anything that changes the **context schema**, a **skill contract**, or an **eval gate** is automatically tier:2, no exceptions.

If none of those are touched, it's tier:1.

## Step 4 — Draft the file

Determine `NNN`: look at existing files in `docs/intents/` and use the next integer, zero-padded to three digits (start at `001` if the directory is empty or doesn't exist).

Build `slug` from the title: lowercase, kebab-case, no stop words, under ~5 words (e.g. `stale-account-context`).

Write `docs/intents/NNN-slug.md` with this shape:

```markdown
# NNN — <Title>

**Tier:** tier:1 | tier:2
**Status:** draft
**Issue:** #<number, if one exists>

## Problem
<synthesized, concrete>

## Proposed outcome
<synthesized, a state not a task list>

## Who it affects
<synthesized>

## Constraints
<synthesized, or "None identified.">

## Open questions
<synthesized, as a list>

## How we'll know it worked
<synthesized, checkable — metric, eval gate, or observable>
```

Show the user the full draft before writing it. Ask them to correct anything you got wrong rather than assuming silence means approval.

## Step 5 — File it

- Write the file to `docs/intents/NNN-slug.md`.
- If no GitHub Issue exists yet, open one from the `intent.yml` template (`gh issue create --template intent.yml`) or a plain issue if the template path isn't available, and link the committed file to it.
- If an issue already exists, comment on it with a link to the new file once it's committed, and apply the tier label if it wasn't already set.
- Commit on a branch, not `main` — this repo has branch protection, and the intent/spec merge is itself a review gate.

## Step 6 — Enforce the solo-discipline rule

Once the file is written, say so plainly and stop. Do not suggest merging or approving it in this same session. Remind the user, once, briefly:

> Written. Approve this in a separate session — if it still makes sense cold, it's real.

Do not soften or skip this reminder even if the user seems eager to move straight to the spec stage.
