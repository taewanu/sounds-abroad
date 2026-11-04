# Sounds Abroad

A 3D globe for exploring the music trending in each country.

Run everything through mise, so non-interactive shells get the pinned Node and pnpm: `mise exec -- pnpm <script>`. The gate is `mise exec -- pnpm verify`, which runs the same checks as CI; pass it before opening a PR. Other commands are in the [README](README.md#for-developers).

## Rules

- Each slice gets one branch and one PR into `main`. A human decides every merge: don't merge unless told to.
- Never delete published chart or commentary data from the object store; expose or change secrets; change Vercel settings or DNS; or weaken the GitHub ruleset or workflow permissions.
- Leave these to a human, in an issue labelled `ready-for-human`: the published chart shape (`src/lib/chart-schema.ts`), public `/c/<code>` URLs, and crawl cadence or cache lifetimes, which drive billed meters.

## Where to look

- Decisions: [`docs/adr/README.md`](docs/adr/README.md)
- Domain terms: [`CONTEXT.md`](CONTEXT.md)
- Issue tracker, triage labels and how skills read domain docs: [`docs/agents/`](docs/agents)
- Release history: annotated git tags (`git tag --list`)
