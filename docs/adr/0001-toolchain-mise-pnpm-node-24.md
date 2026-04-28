# ADR-0001: Toolchain — mise + pnpm 10 + Node 24 LTS

**Status:** Accepted (2026-04-28)

## Context

Node and package-manager versions need to be reproducible across local development, CI (GitHub Actions for the data pipeline), and Vercel deploy. Three concrete pressures:

1. **Node 25 is released but non-LTS**, and Node 25 dropped Corepack from the bundle, breaking the easiest path to pinned pnpm.
2. **Corepack itself shows ongoing pain in 2026** — community reports of "EEXIST" errors in CI, version-resolution confusion, and unstable-build selection. Standalone pnpm install is the more reliable trend.
3. **Node 22 is in Maintenance LTS** (Active LTS ended 2025-10), so picking 22 means choosing a release that's already past its prime.

The choice is between (a) Corepack + Node 22, (b) Homebrew/global pnpm + Node 22 or 24, or (c) a generic version manager.

## Decision

Use **mise** to manage both Node and pnpm:

- `mise.toml` pins `node = "24"` (current Active LTS, supported through 2028-05) and `pnpm = "10"` (current stable; pnpm 11 is in RC).
- `package.json` mirrors with `"packageManager": "pnpm@10.23.0"` (exact version) so Vercel and any non-mise environment resolves the same pnpm binary.
- All scripted bash invocations wrap commands with `mise exec --` (non-interactive shells don't load `.zshrc`, so mise shims aren't on PATH unless explicitly invoked).
- GitHub Actions uses the official `jdx/mise-action` to read `mise.toml`.

## Consequences

**Positive**

- Single source of truth (`mise.toml`) covers Node + pnpm — no separate `.nvmrc` / `.npmrc`.
- mise extends to other tools later (deno, bun, ruby) without learning a new manager.
- Avoids the Corepack stability issues and Node 25's removal of Corepack entirely.

**Negative**

- mise has lower industry recognition than Volta or nvm, slightly hurting onboarding friction for outside contributors.
- Non-interactive bash needs the `mise exec --` prefix; this is easy to forget and produces "command not found" errors. Pre-commit hooks must wrap explicitly (already done in `.husky/pre-commit`).

**Neutral**

- pnpm 11 (RC at time of decision) brings SQLite store + tighter security defaults; revisit migration after stable release.
