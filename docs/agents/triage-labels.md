# Triage Labels

This repo uses the canonical triage roles defined by the engineering-skills convention. Five labels, used as-is.

| Label             | Meaning                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate this issue (default state for new issues).                      |
| `needs-info`      | Issue is too vague to act on — waiting on reporter for repro steps, environment, or context. |
| `ready-for-agent` | Fully specified, AFK-ready (an agent can pick it up with no human context).                  |
| `ready-for-human` | Specified, but requires human implementation (judgment-call refactors, design work).         |
| `wontfix`         | Will not be actioned (out of scope, won't reproduce, deferred indefinitely).                 |

## Workflow

```
new issue ──▶ needs-triage ──▶ (maintainer evaluates)
                              ┌─────────────────────────────────────────┐
                              │                                         │
                       needs-info (asks reporter)                       │
                              │                                         │
                              ▼                                         ▼
                       (reporter answers, label removed)        ready-for-agent / ready-for-human / wontfix
                              │
                              └────────▶ needs-triage (re-evaluate)
```

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from the table.

If you ever rename labels (e.g. to match an existing label vocabulary in another repo), update both this table and the actual GitHub repo labels via `gh label edit` to stay in sync.
