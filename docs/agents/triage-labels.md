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

## Specs and their tickets

A spec issue and the tickets it decomposes into take different labels, because
only one of them is something an agent can pick up.

- **A spec issue publishes as `needs-triage`**, the default above. It is a
  statement of a problem and a shape, and what it needs next is a maintainer
  deciding whether that shape is right, then `/to-tickets` to break it down.
- **Its tickets publish as `ready-for-agent`**, one per vertical slice, each
  carrying the acceptance criteria and the blocking edges an agent needs.

`ready-for-agent` on a spec reads as an invitation to implement the whole thing
at once, which is what the label promises: "an agent can pick it up with no
human context". A spec awaiting decomposition offers no such thing.

This differs from the stock instruction in the `to-spec` skill, which applies
`ready-for-agent` at publish time. The rule lives here rather than as a patch to
that skill, because a patched skill reverts on the next refresh and this file
does not.

If you ever rename labels (e.g. to match an existing label vocabulary in another repo), update both this table and the actual GitHub repo labels via `gh label edit` to stay in sync.
