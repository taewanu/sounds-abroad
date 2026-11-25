# ADR-0024: Vite+ lints, formats and runs the git hooks; Next.js still builds

**Status:** Accepted (2026-11-24).

## Context

Linting, formatting and the git hooks ran on four tools with a config each: ESLint with `eslint-config-next`, Prettier with its Tailwind plugin, Husky, and lint-staged. Vite+ (`vite-plus`) bundles Oxlint, Oxfmt and a hook runner behind one `vp` command and one `vite.config.ts`, and another of the owner's repositories already runs it. Next.js ships its lint rules as an ESLint config, so leaving ESLint is a deliberate step off the framework's documented path.

The forcing question: can Oxlint and Oxfmt take over without dropping a check the repo relies on?

## Decision

**`vite-plus` runs lint (`vp lint`), format (`vp fmt`) and the pre-commit and pre-push hooks from `vite.config.ts` and `.vite-hooks/`. Next.js keeps its own `next dev` and `next build`, and Vitest keeps `vitest.config.ts`.**

- The lint config ports the rules ESLint enforced: of the 90 rules on in the ESLint config, 78 have an Oxlint rule of the same name (checked 2026-11-24 against Oxlint 1.94.0), unused variables go to Oxlint's `no-unused-vars`, and import order goes to Oxfmt's `sortImports`. Only the `correctness` category is on; its rules beyond the old set either pass on the existing code or are turned off in the config with a stated reason.
- The two `no-restricted-syntax` checks (`transition-all`, and Escape handling outside `useEscapeLayer`) move to a local Oxlint plugin, `scripts/lint-plugin.ts`, because Oxlint has no `no-restricted-syntax`.
- Oxfmt keeps Prettier's 80-column width, which Oxfmt does not default to, and switches to single quotes to match the owner's other repositories.
- `prepare` runs `vp config --no-agent`, which installs the hook dispatcher without rewriting `AGENTS.md`.

## Consequences

- Oxlint has no counterpart for `@next/next/no-location-assign-relative-destination`, `react/no-deprecated`, or the React Compiler `config` and `gating` rules, so those checks are gone.
- Rules Oxlint offers beyond the old set stay off for now: type-aware rules, `vitest/require-mock-type-parameters`, and the `suspicious` and `perf` categories. Three `jsx-a11y` rules warn rather than fail, because each fix changes markup.
- Vite+ never overwrites an existing `core.hooksPath`, so each clone runs `git config --unset core.hooksPath` once and then `pnpm install`. Until a checkout has this change, git runs no hooks there.
- A lint plugin rule is code the repo maintains, where a `no-restricted-syntax` selector was configuration.

## Revisit if

- A check ESLint caught reaches review or production because Oxlint missed it.
- Oxlint adds `no-restricted-syntax`, which would let the plugin's two rules return to configuration.
- Vite+ stops shipping one of the tools this record relies on, or Next.js ships its rules as an Oxlint config.
