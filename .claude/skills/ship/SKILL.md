---
name: ship
description: Record whether a pull request is ready for an agent to merge. Use once a PR's CI has finished and its review threads are answered. It records a judgment and never merges.
---

# Ship check

Run this once a PR's CI has finished and its review threads are answered. The ruleset already enforces CI and resolved threads; the check adds what the ruleset can't see: the risk tier, a CodeRabbit review on the latest commit, and a `hold` label.

1. Read CodeRabbit's review body as well as its threads. Nitpicks sit in the body, and the check can't see them. Answer each one.
2. Run `mise exec -- pnpm --silent ship <pr-number>`.
3. Post its line on the PR with `gh pr comment <pr-number> --body "<line>"`. These comments are the record a human compares with what actually happened, before agents get any merge authority.
4. Leave the merge to the human, whatever the verdict. `merge-ok` is a judgment to be checked, not permission.

If the verdict parks for `GitHub reports UNKNOWN`, GitHub hadn't computed the merge state yet: run it again.
