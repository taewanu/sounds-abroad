---
name: pre-pr
description: Review a branch before its pull request opens. Runs the CI checks locally, runs code-review, has a fresh subagent trace what the diff newly breaks outside itself, and writes the result into the PR body, where the `gh pr create` hook looks for it. Use before opening any PR, or when the hook blocks `gh pr create`.
---

# Pre-PR review

The `gh pr create` hook (`.claude/hooks/require-pre-pr.py`) refuses a PR whose body has no `## Pre-PR review (<short SHA>)` section for the exact commit being proposed. Any new commit changes that SHA, so it needs a fresh review.

The hook shows that this step happened, not how well. It stops the step being forgotten, not a deliberate bypass.

## 1. Pin the branch

Work in the worktree that holds the branch. Confirm the tree is clean (`git status --short` prints nothing): uncommitted changes would be reviewed but not proposed. Note `git rev-parse HEAD` and `git diff --stat origin/main...HEAD`.

## 2. Run the CI checks locally

```bash
mise exec -- pnpm verify
```

A fresh worktree has no `.env.local`, so `build` fails on missing configuration until it is copied from the main checkout.

## 3. Review the diff

Run the `code-review` skill with `origin/main` as the fixed point. It reports two axes, Standards and Spec. A PR with no issue uses its draft description as the spec. Treat that description's claims as unverified.

## 4. Trace what the diff newly breaks

Diff reviewers read the lines that changed. The defects that reach production sit in the code those lines reach: a caller that relied on a removed fallback, a failure path that now waits longer.

Spawn one general-purpose subagent. Give it the repository path and the diff command, not your own reading of the change, so its review is not anchored on yours. Add facts the repository cannot show it, such as how an outside tool invokes the changed code, but not the cases you suspect. Brief:

> Review `git diff origin/main...HEAD` in `<worktree path>`. For every changed line, trace its callers and dependents outside the diff: grep the call sites and read the code they reach. Report each failure the change newly exposes or makes worse, with the triggering condition, the consequence, and the worst-case bound before and after (staleness, cost, latency, data loss). Give extra weight to anything the diff removes, lengthens or narrows, such as a timer, retry, cache lifetime, fallback, validation or limit, and name what that safeguard used to catch. Cite `file:line` for every claim. Say "none found" rather than padding the report. Under 400 words.

When the change is a guard or a filter, also compare it against the previous version on generated inputs, because a table written beside the code shares its assumptions.

## 5. Settle every finding

Verify each finding against the code before acting on it, then show the findings to the user. Each one is either fixed, which makes a new commit and sends you back to step 1, or kept with a stated reason that goes into the PR body.

## 6. Write the review into the PR body

Only once every finding is settled at the current `HEAD`, add this section to the PR body, with the heading naming the first seven characters of `git rev-parse HEAD` (not `--short`, which can print more). The heading must be a line of its own.

```markdown
## Pre-PR review (<short SHA>)

- CI: `pnpm verify` passed locally.
- <finding>: fixed in <SHA>, or kept because <reason>.
```

Write "No findings." when the reviewers found none. Push the branch before `gh pr create`: the hook compares the reviewed commit with `origin/<branch>`, because that is the commit the PR opens on.

To edit an existing PR, `gh pr edit` isn't checked: rerun this skill after new commits by hand and update the section.

## 7. Measure the pass after review

Once CodeRabbit and any human reviewers have commented, note in the slice retro which of their findings this pass missed and which of its findings they also raised. That comparison is the evidence for whether the step earns its cost.
