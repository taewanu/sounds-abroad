import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    sortImports: true,
    sortTailwindcss: { stylesheet: './src/app/globals.css' },
    // Formatting already skips git-ignored files; these are tracked but must stay byte for byte.
    ignorePatterns: [
      // Static assets, served as committed.
      'public/**',
      // Copied verbatim from upstream repos; reformatting them would bury upstream's real edits in the next refresh's diff.
      '.claude/skills/**',
    ],
  },
  lint: {
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'nextjs', 'import', 'vitest'],
    categories: { correctness: 'error' },
    jsPlugins: ['./scripts/lint-plugin.ts'],
    options: { typeAware: true },
    rules: {
      // eslint-plugin-react-hooks 7.1.1 `recommended-latest`
      'react/rules-of-hooks': 'error',
      'react/unsupported-syntax': 'error',
      // eslint-config-next 16.4.6 `core-web-vitals`
      'import/no-anonymous-default-export': 'error',
      'jsx-a11y/alt-text': ['error', { elements: ['img'], img: ['Image'] }],
      'react/display-name': 'error',
      'react/jsx-no-comment-textnodes': 'error',
      'react/no-unescaped-entities': 'error',
      // eslint-plugin-react `recommended`, which eslint-config-next extends, turns this off.
      'react/no-unsafe': 'off',
      // typescript-eslint 8.74.0 `recommended`
      'typescript/ban-ts-comment': 'error',
      'typescript/no-array-constructor': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-unsafe-function-type': 'error',
      // typescript-eslint 8.74.0 `recommended-type-checked`
      'typescript/no-misused-promises': 'error',
      'typescript/no-unnecessary-type-assertion': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-enum-comparison': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-return': 'error',
      'typescript/only-throw-error': 'error',
      'typescript/prefer-promise-reject-errors': 'error',
      'typescript/require-await': 'error',
      'typescript/restrict-plus-operands': 'error',
      // typescript-eslint 8.74.0 `eslint-recommended`
      'eslint/no-var': 'error',
      'eslint/prefer-const': 'error',
      'eslint/prefer-rest-params': 'error',
      'eslint/prefer-spread': 'error',
      // No preset enables this, and it trades `role="status"` live regions for `<output>`, which HTML reserves for the result of a calculation or user action.
      'jsx-a11y/prefer-tag-over-role': 'off',
      // Vitest documents `vi.fn(() => 0)` without type parameters, and @vitest/eslint-plugin `recommended` leaves this out.
      'vitest/require-mock-type-parameters': 'off',
      // Vitest documents the argument to `toThrow` as optional, and @vitest/eslint-plugin `recommended` leaves this out.
      'vitest/require-to-throw-message': 'off',
      // Packages that re-export dynamically, such as @sentry/nextjs, read as missing names.
      'import/namespace': 'off',
    },
    overrides: [
      {
        files: ['src/**/*.{ts,tsx}'],
        rules: {
          'sounds-abroad/no-transition-all': 'error',
          'sounds-abroad/no-bare-escape': 'error',
        },
      },
      {
        files: ['src/components/use-escape-layer.ts'],
        rules: { 'sounds-abroad/no-bare-escape': 'off' },
      },
      {
        // The image optimizer this rule steers toward is a metered hosting resource,
        // so artwork loads straight from the storefront's CDN through one component.
        files: ['src/components/track-artwork.tsx'],
        rules: { 'nextjs/no-img-element': 'off' },
      },
      {
        // The schema rejects control characters in text on purpose.
        files: ['src/lib/chart-schema.ts'],
        rules: { 'eslint/no-control-regex': 'off' },
      },
      {
        // Next documents route handlers and config callbacks, such as headers(), in async form.
        files: ['next.config.ts', 'src/app/**/route.ts'],
        rules: { 'typescript/require-await': 'off' },
      },
      {
        files: ['**/*.test.{ts,tsx}'],
        rules: {
          'vitest/consistent-test-it': ['error', { fn: 'test' }],
          // @vitest/eslint-plugin 1.6.28 `recommended`
          'vitest/no-commented-out-tests': 'error',
          'vitest/no-identical-title': 'error',
          'vitest/no-import-node-test': 'error',
          'vitest/no-interpolation-in-snapshots': 'error',
          'vitest/no-mocks-import': 'error',
          'vitest/no-unneeded-async-expect-function': 'error',
          'vitest/prefer-called-exactly-once-with': 'error',
          // React documents `await act(async () => ...)` even with nothing to await, and async test doubles are the natural stand-in for promise-returning dependencies.
          'typescript/require-await': 'off',
          // typescript-eslint sends test files to eslint-plugin-jest's variant, which Oxlint lacks, because `expect(mock.method)` reads a mock without calling it.
          'typescript/unbound-method': 'off',
        },
      },
    ],
  },
  staged: { '*': 'vp check --fix' },
});
