# Sounds Abroad

A 3D globe-based world music discovery web app — explore trending music around the world.

## Tech stack

- **Framework**: Next.js 16 (App Router + Turbopack), React 19, TypeScript
- **Styling**: Tailwind CSS v4 (CSS-first config via `@theme`)
- **3D**: `@react-three/fiber`, `@react-three/drei`, `gsap`, `d3-geo` _(planned, Phase 4)_
- **UI**: `@radix-ui/react-dialog`, `motion` _(planned, Phase 3)_
- **Design system**: generated with Claude Design and refined through pointing-and-feedback — tokens live in [`src/app/globals.css`](src/app/globals.css), self-hosted fonts in [`src/app/fonts/`](src/app/fonts/), brand assets in [`public/`](public/)
- **Toolchain**: Node 24 + pnpm 10 via [mise](https://mise.jdx.dev) (see [`mise.toml`](mise.toml)); Husky 9 + lint-staged for pre-commit format/lint/typecheck
- **Hosting**: Vercel _(Phase 1, in flight)_
- **Observability**: Sentry _(Phase 1, in flight)_

## Run

Wrap commands with `mise exec --` so non-interactive shells (CI, git hooks) resolve the right binaries.

```bash
mise exec -- pnpm install
mise exec -- pnpm dev        # dev server on http://localhost:3000
mise exec -- pnpm build      # production build
mise exec -- pnpm lint
mise exec -- pnpm format
mise exec -- pnpm typecheck
```

## Where to look

- Phase boundaries — annotated git tags (`git tag --list`)
- PRDs and tickets — GitHub Issues (`gh issue list`)
- Architecture Decision Records — [`docs/adr/`](docs/adr)
- Agent-facing project notes — [`AGENTS.md`](AGENTS.md) (also served as `CLAUDE.md` via symlink)
