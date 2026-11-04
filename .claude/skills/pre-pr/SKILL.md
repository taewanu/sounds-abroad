---
name: pre-pr
description: Review a branch locally before its pull request opens. Runs the CI checks, has agents with a clean context run code-review and trace what the diff newly breaks outside itself, and records the review so the pre-push hook lets the branch's first push through. Use before a branch's first push, or when the hook refuses one.
---

# Pre-PR review

The review runs here, before the PR, so its findings land before anyone else reads the change. The session that wrote the code doesn't review it: agents with a clean context do.

The pre-push hook (`.husky/pre-push`) refuses a branch's first push until a review is recorded, so a skipped review surfaces before the PR rather than after CI. Later pushes pass, because commits that answer a review don't need another full pass. The record shows the step happened, not how well. `--no-verify` skips it for a push that needs no review, so a branch pushed that way and opened as a PR later goes unchecked.

The hook lives in each checkout, so it only guards a worktree that has merged it and has run `pnpm install`, which generates `.husky/_`.

## 1. Pin the branch

Work in the worktree that holds the branch. Confirm the tree is clean (`git status --short` prints nothing): uncommitted changes would be reviewed but not proposed. Note `git rev-parse HEAD` and `git diff --stat origin/main...HEAD`.

## 2. Run the CI checks locally

```bash
mise exec -- pnpm verify
```

A fresh worktree has no `.env.local`, so `build` fails on missing configuration until it is copied from the main checkout.

## 3. Review in a clean context

Spawn these agents together. Give each the repository path and the diff command, not your own reading of the change, so its review is not anchored on yours. Add facts the repository cannot show them, such as how an outside tool invokes the changed code, but not the cases you suspect.

**Standards and spec.** One agent runs the `code-review` skill with `origin/main` as the fixed point. If that skill isn't installed, say so in the PR body. Give it the issue, or, for a PR with no issue, the draft description, and tell it to treat that description's claims as unverified.

**Outside the diff.** Diff reviewers read the lines that changed. The defects that reach production sit in the code those lines reach: a caller that relied on a removed fallback, a failure path that now waits longer. One agent gets this brief:

> Review `git diff origin/main...HEAD` in `<worktree path>`. For every changed line, trace its callers and dependents outside the diff: grep the call sites and read the code they reach. Report each failure the change newly exposes or makes worse, with the triggering condition, the consequence, and the worst-case bound before and after (staleness, cost, latency, data loss). Give extra weight to anything the diff removes, lengthens or narrows, such as a timer, retry, cache lifetime, fallback, validation or limit, and name what that safeguard used to catch. Cite `file:line` for every claim. Say "none found" rather than padding the report. Under 400 words.

When the change is a guard or a filter, have an agent also compare it against the previous version on generated inputs, because a table written beside the code shares its assumptions. Spawn any agent that runs git experiments with `isolation: "worktree"`, so a script that lands in the wrong directory can't reset another checkout's files.

## 4. Settle the findings

Verify each finding against the code, then show the findings to the user. Fix only a blocker: a defect that real use of this repository can trigger and that breaks what the change sets out to do, breaks production behavior, loses data, or raises a metered cost. List the rest in the PR body unfixed.

Review once. Don't review again after a fix unless the user asks: findings never run out, and each fix round can add defects of its own.

## 5. Record the review

Only once every finding is settled, record the review. Every worktree shares this setting, and deleting the branch clears it:

```bash
branch=$(git symbolic-ref --short HEAD) && git config "branch.$branch.prePrReviewed" "$(git rev-parse HEAD)"
```

Add the result to the PR body:

```markdown
## Pre-PR review (<SHA>)

- CI: `pnpm verify` passed locally.
- <finding>: fixed in <SHA>, or kept because <reason>.
```

Write "No findings." when the reviewers found none.

## 6. Push

Push from the branch's worktree with `git push -u origin <branch>`, then confirm with `git ls-remote origin <branch>` before opening the PR. The agent hook refuses a push that names main, forces or deletes, or that shares a command with `cd`.

## 7. Measure the pass after review

Once CodeRabbit and any human reviewers have commented, note on the PR which of their findings this pass missed and which of its findings they also raised. That comparison is the evidence for whether the step earns its cost.
