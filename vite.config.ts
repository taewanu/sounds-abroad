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
    categories: { correctness: 'error', suspicious: 'warn', perf: 'warn' },
    jsPlugins: ['./scripts/lint-plugin.ts'],
    options: { typeAware: true },
    rules: {
      // react.dev eslint-plugin-react-hooks recommended; oxlint files these under pedantic/restriction
      'react/rules-of-hooks': 'error',
      'react/unsupported-syntax': 'error',
      // eslint-plugin-react-hooks 7.1.1 leaves this off; `exhaustive-deps` already checks for missing dependencies.
      'react/exhaustive-effect-dependencies': 'off',
      // eslint-config-next turns this off: the automatic JSX runtime needs no React import.
      'react/react-in-jsx-scope': 'off',
      // Turned back on for test files below; elsewhere it flags prose comments.
      'vitest/no-commented-out-tests': 'off',
      'import/no-unassigned-import': ['warn', { allow: ['**/*.css', '**/sentry-init'] }],
      'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],
      // typescript-eslint `recommended`, not covered by the categories
      'typescript/ban-ts-comment': 'error',
      'typescript/no-array-constructor': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-unsafe-function-type': 'error',
      // typescript-eslint `recommended-type-checked`, not covered by the categories at error
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
      // `recommended-type-checked` turns the core rule off in favor of `typescript/no-implied-eval`.
      'eslint/no-implied-eval': 'off',
      // Type-aware rules outside `recommended-type-checked` that the categories would turn on
      'typescript/consistent-return': 'off',
      'typescript/no-generated-empty-object-type': 'off',
      'typescript/no-meaningless-void-operator': 'off',
      'typescript/no-misused-spread': 'off',
      'typescript/no-unnecessary-boolean-literal-compare': 'off',
      'typescript/no-unnecessary-template-expression': 'off',
      'typescript/no-unnecessary-type-arguments': 'off',
      'typescript/no-unnecessary-type-conversion': 'off',
      'typescript/no-unnecessary-type-parameters': 'off',
      'typescript/no-unsafe-enum-assignment': 'off',
      'typescript/no-unsafe-type-assertion': 'off',
      'typescript/no-useless-default-assignment': 'off',
      'typescript/require-array-sort-compare': 'off',
      // typescript-eslint `eslint-recommended`
      'eslint/no-var': 'error',
      'eslint/prefer-const': 'error',
      'eslint/prefer-rest-params': 'error',
      'eslint/prefer-spread': 'error',
      // eslint-config-next, outside the correctness category
      'import/no-anonymous-default-export': 'error',
      'react/display-name': 'error',
      'react/jsx-no-comment-textnodes': 'error',
      'react/no-unescaped-entities': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      // Oxlint's correctness category has these, but @vitest/eslint-plugin `recommended` leaves them out.
      'vitest/require-mock-type-parameters': 'off',
      'vitest/require-to-throw-message': 'off',
      // Packages that re-export dynamically, such as @sentry/nextjs, read as missing names.
      'import/namespace': 'off',
      // eslint-plugin-jsx-a11y 6.10.2 `recommended` options, where Oxlint's defaults differ
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        {
          handlers: [
            'onClick',
            'onError',
            'onLoad',
            'onMouseDown',
            'onMouseUp',
            'onKeyPress',
            'onKeyDown',
            'onKeyUp',
          ],
          alert: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
          body: ['onError', 'onLoad'],
          dialog: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad'],
        },
      ],
      'jsx-a11y/no-static-element-interactions': ['error', { allowExpressionValues: true }],
      // Outside eslint:recommended, typescript-eslint `recommended-type-checked`, and the react and jsx-a11y
      // `recommended` presets, and every hit was deliberate.
      'typescript/consistent-return': 'off',
      'eslint/no-await-in-loop': 'off',
      'eslint/no-shadow': 'off',
      'eslint/no-underscore-dangle': 'off',
      'eslint/no-unmodified-loop-condition': 'off',
      'jsx-a11y/prefer-tag-over-role': 'off',
      'react/no-array-index-key': 'off',
      'typescript/no-extraneous-class': 'off',
      'typescript/no-unnecessary-boolean-literal-compare': 'off',
      'typescript/no-unsafe-type-assertion': 'off',
      // `toSorted` is ES2023, which some browsers in Next's supported floor lack, so the TypeScript lib stops at ES2022.
      'unicorn/no-array-sort': 'off',
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
        // PostHog documents the default import, which is the same client as the named export.
        files: ['src/lib/analytics.ts', 'src/instrumentation-client.ts'],
        rules: { 'import/no-named-as-default': 'off' },
      },
      {
        // The schema rejects control characters in text on purpose.
        files: ['src/lib/chart-schema.ts'],
        rules: { 'eslint/no-control-regex': 'off' },
      },
      {
        files: ['**/*.test.{ts,tsx}'],
        rules: {
          'vitest/consistent-test-it': ['error', { fn: 'test' }],
          // @vitest/eslint-plugin `recommended`, outside the correctness category
          'vitest/no-commented-out-tests': 'error',
          'vitest/no-identical-title': 'error',
          'vitest/no-import-node-test': 'error',
          'vitest/no-interpolation-in-snapshots': 'error',
          'vitest/no-mocks-import': 'error',
          'vitest/no-unneeded-async-expect-function': 'error',
          'vitest/prefer-called-exactly-once-with': 'error',
          // A test's doubles and helpers stay inside the test or describe block that uses them.
          'unicorn/consistent-function-scoping': 'off',
          // React documents `await act(async () => ...)` even with nothing to await, and async test doubles are the natural stand-in for promise-returning dependencies.
          'typescript/require-await': 'off',
        },
      },
    ],
  },
  staged: { '*': 'vp check --fix --deny-warnings' },
});
