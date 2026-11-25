# ADR-0023: `package.json` pins Node and pnpm, with no version manager

**Status:** Accepted (2026-11-24). Supersedes [ADR-0001](0001-toolchain-mise-pnpm-node-24.md), whose mise pinned a pnpm that `packageManager` already pinned and a Node that pnpm can now pin itself.

## Context

ADR-0001 chose mise to pin Node and pnpm in one place for local shells, CI and Vercel. In practice pnpm had two records: `mise.toml` with `mise.lock`, and `package.json#packageManager`. Only the second took effect. pnpm switches to the `packageManager` version whatever binary launched it, so `mise exec -- pnpm --version` printed the `packageManager` version (checked 2026-11-24). When Renovate replaced Dependabot (#506), two of its rules existed only to keep the two records in step.

Meanwhile pnpm 10.14 added `devEngines.runtime`: `pnpm install` downloads the declared Node, records its per-platform checksums in `pnpm-lock.yaml`, and links it into `node_modules/.bin`, so every `pnpm` script runs on it. That covers what `mise.lock` did for Node.

The forcing question: does mise still do anything `package.json` can't?

## Decision

**`package.json` is the only toolchain pin: `packageManager` pins pnpm, and `devEngines.runtime` pins an exact Node with `onFail: "download"`. The repo uses no version manager; a contributor installs pnpm and nothing else.**

- Commands run as `pnpm <script>` or `pnpm exec <bin>`, which put the pinned Node first on `PATH`. The `mise exec --` prefix is gone from hooks, workflows and docs.
- CI installs pnpm with `pnpm/action-setup` in standalone mode, so pnpm itself does not run on the runner's Node, and fails if `pnpm exec node` reports a version other than `devEngines.runtime.version`.
- Renovate's npm manager updates both pins. Node majors are raised by hand, together with the Vercel project's Node setting.

### Alternatives rejected

- **Keep mise as the launcher, with `packageManager` as the only pnpm pin.** mise would then pin only Node, which `devEngines.runtime` already pins with a lockfile checksum, and every scripted command would keep its `mise exec --` prefix.
- **`.nvmrc` with nvm or fnm.** A second tool and a second record of the Node version, which is what this record removes.
- **Corepack.** ADR-0001's reasons against it still apply.

## Consequences

- Every install downloads Node into `node_modules`. Vercel's install step took 8.7 s on a preview with the pin, against 1.6 s on #506's preview (measured 2026-11-24), and CI downloads it on every run because no tool cache holds it.
- Vercel runs its Build Command, `next build`, directly rather than through pnpm, and serves functions on the project's Node setting, `24.x` (both read from the project settings 2026-11-24). Production therefore runs whichever 24.x patch Vercel picks, not the pinned one. Whether Vercel's build step resolves the downloaded Node is unverified.
- A Node major needs two changes: `devEngines.runtime` and the Vercel project setting. Changing only the first splits CI from production.
- A bare `node` or `npx` outside pnpm runs whatever Node is on `PATH`.

## Revisit if

- The repo adopts a non-JavaScript tool that needs a pinned version, the reach ADR-0001 valued in mise.
- The Node download becomes a noticeable share of CI or Vercel build time; the Vercel figure above is the baseline.
- pnpm changes or drops `devEngines.runtime`.
- A defect traces to the gap between the pinned Node and the patch Vercel runs.
