# ADR-0024: Vite+ lints, formats and runs the git hooks; Next.js still builds

**Status:** Accepted (2026-11-24).

## Context

Linting, formatting and the git hooks ran on four tools with a config each: ESLint with `eslint-config-next`, Prettier with its Tailwind plugin, Husky, and lint-staged. Vite+ (`vite-plus`) bundles Oxlint, Oxfmt and a hook runner behind one `vp` command and one `vite.config.ts`, and another of the owner's repositories already runs it. Next.js ships its lint rules as an ESLint config, so leaving ESLint is a deliberate step off the framework's documented path.

The forcing question: can Oxlint and Oxfmt take over without dropping a check the repo relies on?

## Decision

**`vite-plus` runs lint (`vp lint`), format (`vp fmt`) and the pre-commit and pre-push hooks from `vite.config.ts` and `.vite-hooks/`. Next.js keeps its own `next dev` and `next build`, and Vitest keeps `vitest.config.ts`.**

- Lint rules follow the current official presets rather than the old config: Oxlint's `correctness` category as errors and its `suspicious` and `perf` categories as warnings, plus every rule Oxlint can run from `eslint-plugin-react-hooks` 7.1.1 `recommended`, `typescript-eslint` 8.74.0 `recommended`, `eslint-config-next` 16.4.6, and `@vitest/eslint-plugin` 1.6.28 `recommended` on test files (versions current on 2026-11-24, checked against Oxlint 1.94.0, the version `vite-plus` 1.8.0 bundles). A rule that guards class components or an API React 19 removed is not added. Import order goes to Oxfmt's `sortImports`. File names are kebab-case or PascalCase, and a bare side-effect import warns unless it loads CSS or Sentry's setup.
- The two `no-restricted-syntax` checks (`transition-all`, and Escape handling outside `useEscapeLayer`) move to a local Oxlint plugin, `scripts/lint-plugin.ts`, because Oxlint has no `no-restricted-syntax`.
- Oxfmt runs at its default 100-column width with single quotes, the format and lint baseline the owner's other repositories share.
- `prepare` runs `vp config --no-agent`, which installs the hook dispatcher without rewriting `AGENTS.md`.

## Consequences

- Oxlint has no counterpart for `@next/next/no-location-assign-relative-destination`, `react/no-deprecated`, or the React Compiler `config` and `gating` rules, so those checks are gone. `react/require-render-return`, which `eslint-config-next` still enables, applies only to class components and is left out.
- An unused import fails lint but is no longer removed on commit: Oxlint offers that fix only as one that may change behavior, and `vp check --fix` applies safe fixes only.
- Oxlint rules outside those presets stay off: type-aware rules and the two correctness rules `@vitest/eslint-plugin` leaves out (`require-mock-type-parameters`, `require-to-throw-message`). Three `jsx-a11y` correctness rules warn rather than fail, because each fix changes markup.
- Vite+ never overwrites an existing `core.hooksPath`, so each clone runs `git config --unset core.hooksPath` once and then `pnpm install`. Until a checkout has this change, git runs no hooks there. Running `pnpm install` in a checkout that still has Husky sets the shared `core.hooksPath` back to `.husky/_`, which turns hooks off in every checkout without an error, and `vp config` will not take it back while more than one worktree is registered; `git config core.hooksPath .vite-hooks/_` restores it.
- A lint plugin rule is code the repo maintains, where a `no-restricted-syntax` selector was configuration.

## Revisit if

- A check ESLint caught reaches review or production because Oxlint missed it.
- One of the four presets ships a new major: diff its rules against the config again.
- Oxlint adds `no-restricted-syntax`, which would let the plugin's two rules return to configuration.
- Vite+ stops shipping one of the tools this record relies on, or Next.js ships its rules as an Oxlint config.
