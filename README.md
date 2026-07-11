<div align="center">

# Sounds Abroad

Spin a globe, tap a country, hear what's trending there.

[soundsabroad.app](https://soundsabroad.app)

<img src="docs/media/hero.png" alt="Sounds Abroad: South Korea selected, showing its trending tracks" width="300" />
<img src="docs/media/playing.png" alt="Sounds Abroad: a Korean track playing, with the now-playing bar" width="300" />

</div>

---

## What it does

Travel through other countries' music. Spin the globe, pick a country, and you get its top tracks for the day, pulled from Apple's charts. Each country also has one "gem": a local favorite, sometimes with a short note on why it caught on. Preview a track in place, or open it in Spotify or Apple Music.

First-time visitors get a short gesture tour instead of written instructions.

## How it was built

A solo project, built mostly with Claude Code. A few specifics:

- Charts refresh daily: a scheduled crawl reads Apple's public charts and bakes them into a static payload (Vercel Cron, monitored by Sentry).
- The globe is real 3D (react-three-fiber), not a map image; each country is a selectable geographic feature.
- Decisions are written down as they happen, in `docs/adr/`, rather than reconstructed after.

## Tech

Next.js 16 (App Router) · React 19 · react-three-fiber / three · topojson-client · motion · zustand · Tailwind CSS v4 · Vercel · Sentry.

---

## For developers

Node 24 + pnpm 10 via [mise](https://mise.jdx.dev). Wrap commands with `mise exec --` so non-interactive shells (CI, git hooks) resolve the right binaries.

```bash
mise exec -- pnpm install
mise exec -- pnpm dev        # dev server on http://localhost:3000
mise exec -- pnpm build      # production build
mise exec -- pnpm lint
mise exec -- pnpm format
mise exec -- pnpm typecheck
mise exec -- pnpm test
```

Pre-commit hook (Husky 9 + lint-staged) runs format + lint + typecheck on staged files.

### Where to look

- Design system: tokens in [`src/app/globals.css`](src/app/globals.css), self-hosted fonts in [`src/app/fonts/`](src/app/fonts/), brand assets in [`public/`](public/)
- Architecture Decision Records: [`docs/adr/`](docs/adr)
- Phase history: annotated git tags (`git tag --list`)
- Issues: GitHub Issues (`gh issue list`)
- Agent notes: [`AGENTS.md`](AGENTS.md) (served as `CLAUDE.md` via symlink)
- Agent configuration: [`docs/agents/`](docs/agents) (issue tracker, triage labels, domain notes)
