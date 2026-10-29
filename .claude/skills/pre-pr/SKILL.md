---
name: pre-pr
description: Review a branch before its pull request opens. Runs the CI checks locally, then has a fresh subagent trace what the diff newly breaks outside itself, and records the review that the `gh pr create` hook requires. Use before opening any PR, or when the hook blocks `gh pr create`.
---

# Pre-PR review

The `gh pr create` hook (`.claude/hooks/require-pre-pr.sh`) refuses a PR until this skill has recorded a review of the exact commit being proposed. Any new commit changes that commit, so it needs a fresh review.

Diff reviewers read the lines that changed. The defects that reach production sit in the code those lines reach: a caller that relied on a removed fallback, a failure path that now waits longer. This skill makes that trace a step of its own, done by a reader who has not seen the author's reasoning.

## 1. Pin the branch

Work in the worktree that holds the branch. Confirm the tree is clean (`git status --short` prints nothing): uncommitted changes would be reviewed but not proposed. Note `git rev-parse HEAD` and `git diff --stat origin/main...HEAD`.

## 2. Run the CI matrix locally

Run each step CI runs, and stop at the first failure:

```bash
mise exec -- pnpm lint
mise exec -- pnpm format:check
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm build
```

A fresh worktree has no `.env.local`, so `build` fails on missing configuration until it is copied from the main checkout.

## 3. Trace what the diff newly breaks

Spawn one general-purpose subagent. Give it the repository path and the diff command, not your own reading of the change, so its review is not anchored on yours. Brief:

> Review `git diff origin/main...HEAD` in `<worktree path>`. For every changed line, trace its callers and dependents outside the diff: grep the call sites and read the code they reach. Report each failure the change newly exposes or makes worse, with the triggering condition, the consequence, and the worst-case bound before and after (staleness, cost, latency, data loss). Give extra weight to anything the diff removes, lengthens or narrows, such as a timer, retry, cache lifetime, fallback, validation or limit, and name what that safeguard used to catch. Cite `file:line` for every claim. Say "none found" rather than padding the report. Under 400 words.

## 4. Settle every finding

Show the findings to the user. Each one is either fixed, which makes a new commit and sends you back to step 1, or kept with a stated reason that goes into the PR body.

## 5. Record the review

Only once every finding is settled at the current `HEAD`:

```bash
dir="$(git rev-parse --path-format=absolute --git-common-dir)/pre-pr"
mkdir -p "$dir" && touch "$dir/$(git rev-parse HEAD)"
```

The record lives in the git directory every worktree shares, so it is never committed and any worktree's `gh pr create` finds it.
