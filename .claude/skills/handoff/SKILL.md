---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to a path produced by:

```bash
BASE=$(mktemp "${TMPDIR:-/tmp}/handoff-XXXXXX") && mv "$BASE" "$BASE.md" && echo "$BASE.md"
```

(BSD `mktemp` on macOS only substitutes **trailing** `X`s, so the `.md` extension must be appended after the random suffix is generated. Read the resulting file before you write to it.)

Suggest the skills to be used, if any, by the next session.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
