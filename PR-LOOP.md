# The first real PR through the loop

A step-by-step for taking one change from branch to merged, exercising the whole
SDLC loop the way every future change will go. The change itself is deliberately
small — a **`tier:0` chore**: add the two deferred files under `evals/golden/`.

Why this change: it touches `evals/golden/**` (the reviewed-change path the
`.claude/settings.json` deny rule and the protect-paths hook are built to gate)
and `evals/**` (which triggers `evals.yml` for the first time, so you see the
comparison comment land on a PR).

- **Tier:** `tier:0` — no intent, no spec, no plan. Direct PR, CI green, self-merge.
- **Prereqs already done:** GitHub App + `CLAUDE_CODE_OAUTH_TOKEN` secret; labels
  created; branch protection ruleset on `main` (require `verify` + `gitleaks`,
  require PR, block force-push, linear history).

---

## 0. Start clean

```bash
cd ~/Development/agentic-sales-hub
git checkout main
git pull origin main
git status            # must be clean
pnpm install          # in case the lockfile moved
```

## 1. Branch

Name the branch for the change, not for a tier.

```bash
git checkout -b chore/golden-set-readme-and-lock
```

## 2. Make the change

### 2a. Lift the guardrail (temporarily)

`evals/golden/**` is denied to the agent by design. To author these files, comment
out the deny line — it gets restored **in this same PR** (step 2d), and the
protect-paths hook still guards the path in the meantime.

In `.claude/settings.json`, change:

```jsonc
    "deny": [
      "Read(./context/accounts/**/inbound/**)",
      "Write(./context/legal/**)",
      "Edit(./context/legal/**)",
      "Write(./evals/golden/**)",
      "Edit(./evals/golden/**)"
    ]
```

to temporarily drop the two `evals/golden` lines. (If a settings edit needs a
session restart to take effect, just create the files by hand with an editor.)

### 2b. `evals/golden/README.md`

```markdown
# The golden set

Ground truth for the Agentic Sales Hub eval suite. Protected — it changes only through a
reviewed PR (`.claude/settings.json` denies writes; a protect-paths hook blocks
`rm`/`mv`), because a golden set you can quietly edit is not a golden set.

## What's here

| Path | What |
|---|---|
| `allowed-slugs.txt` | Account slugs permitted under `context/accounts/` beyond the synthetic-namespace regex (`^(meridian-|acme-|northwind-|globex-|initech-)[a-z0-9-]+$`). One slug per line. |
| `corpus.lock.json` | sha256 of every `context/` file at the last golden-set update. `pnpm eval` warns when the corpus has drifted from the lock without the labels being revisited. Regenerate with `pnpm eval:lock`. |

Labeled cases live in `evals/cases/`:

- `cases/sow-review/*.case.json` + `cases/sow-review/expected/*.findings.json` —
  two counterparty redlines with every issue a competent reviewer should catch,
  tagged with severity. `sow-redline` carries a deliberate prompt-injection and
  asserts the quarantine hook blocks the induced tool call.
- `cases/find-evidence/*.case.json` — described deal situations with labeled
  relevant spans.

## Adding a case

1. Add the `.case.json` (and, for `sow-review`, the `expected/*.findings.json`).
2. `pnpm eval --suite <skill>` — confirm the gates.
3. If the corpus changed, `pnpm eval:lock`.
4. **Every production defect becomes a permanent case here** — the fix PR must
   include the case that would have caught it.

## Gates

| Suite | Metric | Gate |
|---|---|---|
| `sow-review` | blocker recall | **= 1.00** (non-negotiable) |
| `sow-review` | precision | ≥ 0.70 |
| `sow-review` | citation validity | = 1.00 |
| `sow-review` | injection case | hook blocks the induced write |
| `find-evidence` | recall on required spans | ≥ 0.90 |
| `find-evidence` | citation validity | = 1.00 |
| any suite | primary metric vs. last committed result | no net regression |
```

### 2c. The lock file + `eval:lock` script

Add `evals/runner/lock-corpus.ts`:

```ts
#!/usr/bin/env tsx
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { walkContext } from "@agentic-sales-hub/context-core";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const files = await walkContext(repoRoot);
const entries: Record<string, string> = {};
for (const rel of files.sort()) {
  const bytes = await readFile(join(repoRoot, rel));
  entries[rel] = createHash("sha256").update(bytes).digest("hex");
}
const lock = { generated: new Date().toISOString().slice(0, 10), files: entries };
await writeFile(
  join(repoRoot, "evals/golden/corpus.lock.json"),
  JSON.stringify(lock, null, 2) + "\n",
);
console.log(`eval:lock — ${Object.keys(entries).length} files locked`);
```

Add the script to root `package.json`:

```jsonc
    "eval:lock": "tsx evals/runner/lock-corpus.ts",
```

Generate the lock:

```bash
pnpm eval:lock            # writes evals/golden/corpus.lock.json
```

(Optional, can be a later PR: have `evals/runner/cli.ts` read the lock and print a
`WARN: corpus drifted from golden lock` line when a hash differs. Not required for
this PR — the file + script are enough to unblock it.)

### 2d. Restore the guardrail

Put the two `evals/golden` lines back in `.claude/settings.json` `deny`. The diff
for this file should net to **zero** by the end.

## 3. Verify locally — the full gate

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm eval --suite all          # all gates PASS, "regression vs <last>: PASS"
pnpm corpus:validate
pnpm check:no-real-data
pnpm skills:sync:check
```

All green before you push. If anything is red, fix it on this branch — never push
red.

## 4. Commit

```bash
git add -A
git status                     # .claude/settings.json should NOT appear if 2d netted to zero
```

```bash
git commit -m "$(cat <<'EOF'
chore: golden-set README + corpus lock (tier:0)

- evals/golden/README.md documents the golden set, how to add a case, the gates.
- evals/golden/corpus.lock.json: sha256 of every context/ file, via a new
  eval:lock script (evals/runner/lock-corpus.ts).

Deferred from plan 001 step 7 — evals/golden/** is deny-listed to the agent, so
it lands through a reviewed PR, which is the point.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## 5. Push and open the PR

```bash
git push -u origin chore/golden-set-readme-and-lock
gh pr create \
  --base main \
  --label tier:0 \
  --title "chore: golden-set README + corpus lock" \
  --body "$(cat <<'EOF'
## What and why

`tier:0` chore. Adds the two files deferred from plan 001 step 7:

- `evals/golden/README.md`
- `evals/golden/corpus.lock.json` (+ `pnpm eval:lock` script)

Also the first PR to touch `evals/golden/**` — the reviewed-change path the deny
rule and protect-paths hook are designed to gate — and the first to trigger
`evals.yml`.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm eval --suite all`
— all green, no regression. `corpus:validate`, `check:no-real-data`,
`skills:sync:check` pass.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 6. Watch CI

```bash
gh pr checks --watch
```

Expect:

| Check | Why it runs | Expected |
|---|---|---|
| `verify` (ci.yml) | every PR | pass — typecheck/lint/test/build/skills:sync/corpus/no-real-data |
| `gitleaks` (ci.yml) | every PR | pass |
| `review` / `claude-review` (claude-review.yml) | every PR | posts inline comments; is **not** a required check |
| `evals` (evals.yml) | this PR touches `evals/**` | pass — posts a per-suite/per-case comparison comment; `regression_verdict: PASS` |

If `evals` posts a comment but its job is green, that is the loop working: you now
have a comparison comment on a PR for the first time.

## 7. Review it yourself

Framework §1.4: *Claude reviews everything inbound; you review everything Claude
authored.* Read the `claude-review` inline comments, then read the diff for
**intent and risk**:

- Does `.claude/settings.json` net to zero? (The guardrail must be back.)
- Is `corpus.lock.json` hashing the right 28 files?
- Does the `eval:lock` script have any path that could write outside
  `evals/golden/`?

## 8. Merge

Squash-merge (linear history is required by the ruleset):

```bash
gh pr merge --squash --delete-branch
```

Then locally:

```bash
git checkout main
git pull origin main
git branch -d chore/golden-set-readme-and-lock   # if not auto-deleted locally
```

## 9. Update HANDOFF.md

Cross off follow-up #3, note that the loop has been exercised once and `evals.yml`
posts comparison comments correctly. Commit that directly to `main` (a docs-only
`tier:0` touch — or fold it into the next PR).

---

## What this rehearsed for every future change

| Step | Generalizes to |
|---|---|
| 1 | one branch per issue, named for the change |
| 3 | never push red — `typecheck / lint / test / build / eval` local first |
| 5 | every PR is labeled with its tier; T1+ links its plan, T2 links intent + spec + plan |
| 6 | `verify` + `gitleaks` gate every PR; `evals` gates any skill/schema/corpus/eval change and posts a comparison |
| 7 | Claude's automated review runs first and mechanically; your review is intent + risk, and it is never optional on agent-authored PRs |
| 8 | squash-merge, linear history, branch auto-deleted |

For a **`tier:1`** change, add before step 1: open an issue, run `/write-intent`
is skipped (T1 has no intent) but you do start in **plan mode**, commit
`docs/plans/NNN-slug.md` on the branch first. For **`tier:2`**: the full
`/write-intent` → `/write-spec` → plan chain, each committed before code, intent +
spec merged as their own gate.
