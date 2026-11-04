# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context**: all domain documentation lives at the repo root.

## File structure

```
/
├── CONTEXT.md             ← domain glossary
├── docs/
│   ├── adr/               ← Architecture Decision Records
│   │   └── README.md      ← index: which records steer today's code
│   └── agents/            ← per-repo skills config (this directory)
└── src/
```

ADRs use sequential 4-digit numbering with kebab-case titles.

## ADR or spec?

Open an ADR only when the decision rejects a real alternative someone would otherwise re-pick and get wrong. If the code, schema, or a one-line commit body already carries the WHY, keep it there.

- **ADR:** X over Y, where Y stays tempting and the reason isn't visible at the call site.
- **Commit or comment:** a narrow rule the code enforces itself (one lint sub-rule, one bypass).
- **Issue or PRD:** what to build; the ADR is only why the shape was chosen.

## Before exploring, read

- `CONTEXT.md`: definitions of domain terms
- Steering ADRs in `docs/adr/README.md` that touch the area you're about to work in

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, refactor proposal, hypothesis, test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (add the term with `domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-NNNN, but worth reopening because…_
