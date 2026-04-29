# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context** — all domain documentation lives at the repo root.

## File structure

```
/
├── CONTEXT.md                                       ← domain glossary (created lazily)
├── docs/
│   ├── adr/                                         ← Architecture Decision Records
│   │   ├── 0001-toolchain-mise-pnpm-node-24.md      ← why mise + pnpm 10 + Node 24
│   │   └── 0002-public-repo-for-actions-budget.md   ← why public GitHub repo
│   ├── agents/                                      ← per-repo skills config (this directory)
│   └── plans/                                       ← Phase implementation plans
└── src/
```

ADRs use sequential 4-digit numbering with kebab-case titles. The two listed are illustrative; see `docs/adr/` for the live set.

## Before exploring, read whatever exists

- `CONTEXT.md` (if present) — definitions of domain terms
- ADRs in `docs/adr/` that touch the area you're about to work in

If `CONTEXT.md` doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The producer skill (`grill-with-docs`) creates it lazily when terms actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, refactor proposal, hypothesis, test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-NNNN — but worth reopening because…_
