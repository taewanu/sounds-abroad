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

## 3. Run the review

```
Workflow({ name: "pre-pr", args: { sha: "<HEAD>", brief: "<brief>", guard: false } })
```

`.claude/workflows/pre-pr.js` holds the reviewers and the limits: at most two rounds, and only a `blocker` finding starts the second. Every agent works in its own worktree, so a script that lands in the wrong directory can't reset another checkout's files, and fixes don't move the branch until the user accepts them.

The brief is the issue or, for a PR with no issue, the draft description, plus facts the repository cannot show, such as how an outside tool invokes the changed code. Leave out your own reading of the change and the cases you suspect, so the review is not anchored on them. Set `guard: true` when the change is a guard or a filter, which adds a comparison against the previous version on generated inputs.

## 4. Settle the result

Show the user what the workflow returned. `minors` and `rejected` go into the PR body unfixed, and `status` says what happens next:

- **`clean`:** no blocker remains. If `head` differs from `HEAD`, show `git log -p HEAD..<head>`. Once the user accepts it, run `git merge --ff-only <head>` and repeat step 2.
- **`blocked`:** a blocker survived the second round, or the fixer neither committed a fix nor rejected it. Start no third round: each fix round adds defects of its own. Show `blockers` and `head`, and let the user decide what to fix and what to keep with a stated reason.
- **`incomplete`:** an agent died, so this is not a pass. Run the workflow again.

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

## 6. Push

Push from the branch's worktree with `git push -u origin <branch>`, then confirm with `git ls-remote origin <branch>` before opening or updating the PR. The agent hook refuses a push that names main, forces or deletes, or that shares a command with `cd`.

## 7. Measure the pass after review

Once CodeRabbit and any human reviewers have commented, note on the PR which of their findings this pass missed and which of its findings they also raised. That comparison is the evidence for whether the step earns its cost.
