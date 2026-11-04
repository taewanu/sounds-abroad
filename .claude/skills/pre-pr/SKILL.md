---
name: pre-pr
description: Review a branch locally before its pull request opens. Runs the CI checks, has agents with a clean context run code-review and trace what the diff newly breaks outside itself, and records the reviewed changes so the pre-push hook lets them through. Use before pushing a branch for a PR, and again after any code change on it, or when the hook refuses a push.
---

# Pre-PR review

The review runs here, before the PR, so its findings land before anyone else reads the change. The session that wrote the code doesn't review it: agents with a clean context do.

The pre-push hook (`.husky/pre-push`) refuses a commit with no recorded review, so a skipped review surfaces before the push rather than after CI. The record identifies the lines the branch changes against `origin/main`, ignoring where they sit in the file. A change to those lines needs a fresh pass, and a merge or rebase that leaves them alone keeps its review. Two limits follow: the same lines moved within the file keep the review, and main editing right next to them or shrinking a renamed file until git no longer sees a rename can lose it. The record shows the step happened, not how well, and `--no-verify` skips it for a push that needs no review.

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

After a fix round on a branch already reviewed, these agents may review just the new commits.

## 4. Settle every finding

Verify each finding against the code before acting on it, then show the findings to the user. Each one is either fixed, which makes a new commit and sends you back to step 1, or kept with a stated reason that goes into the PR body.

## 5. Record the review

Only once every finding is settled at the current `HEAD`, record its changes from the worktree root. Every worktree shares this directory:

```bash
records="$(git rev-parse --git-common-dir)/pre-pr-reviewed"
id=$(sh .husky/review-id HEAD) && [ -n "$id" ] && mkdir -p "$records" && touch "$records/$id"
```

Add the result to the PR body:

```markdown
## Pre-PR review (<SHA>)

- CI: `pnpm verify` passed locally.
- <finding>: fixed in <SHA>, or kept because <reason>.
```

Write "No findings." when the reviewers found none.

## 6. Hand off the push

A hook stops agents from pushing, so ask the user to push, then confirm with `git ls-remote origin <branch>` before opening or updating the PR.

## 7. Measure the pass after review

Once CodeRabbit and any human reviewers have commented, note on the PR which of their findings this pass missed and which of its findings they also raised. That comparison is the evidence for whether the step earns its cost.
