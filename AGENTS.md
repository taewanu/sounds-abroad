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

- Phase boundaries — annotated git tags. `git show phase-1` for the retrospective; `git tag --list` for the timeline.
- In-flight work — GitHub Issues. `gh issue list` (see `docs/agents/issue-tracker.md`).
- `docs/adr/` — Architecture Decision Records (why we chose X over Y).
- `docs/agents/` — per-repo configuration that the engineering skills assume.

## Agent skills

### Issue tracker

GitHub Issues on `taewanu/sounds-abroad`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) used as-is, no overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` (created lazily) and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
