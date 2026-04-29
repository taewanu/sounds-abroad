# Sounds Abroad

A 3D globe-based world music discovery web app — explore trending music around the world.

## Run commands

Uses pnpm 10 + Node 24 via mise. Wrap commands with `mise exec --` so non-interactive shells (CI, git hooks) resolve the right binaries:

- `mise exec -- pnpm dev` — dev server (Turbopack)
- `mise exec -- pnpm build` — production build
- `mise exec -- pnpm lint` / `pnpm format` / `pnpm typecheck`

Pre-commit hook runs format + lint + typecheck on staged files via Husky 9 + lint-staged.

## Branching

Phase 1 commits directly to `main`. From Phase 2 onward, each Phase gets its own feature branch and PR.

## Where to look

- `docs/plans/` — Phase implementation plans (committed roadmaps)
- `docs/adr/` — Architecture Decision Records (why we chose X over Y)
