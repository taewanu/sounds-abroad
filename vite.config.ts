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
    rules: {
      // react.dev eslint-plugin-react-hooks recommended; oxlint files these under pedantic/restriction
      'react/rules-of-hooks': 'error',
      'react/unsupported-syntax': 'error',
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
      'eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Oxlint's correctness category has these, but @vitest/eslint-plugin `recommended` leaves them out.
      'vitest/require-mock-type-parameters': 'off',
      'vitest/require-to-throw-message': 'off',
      // Packages that re-export dynamically, such as @sentry/nextjs, read as missing names.
      'import/namespace': 'off',
      // Real findings, but each fix changes markup, so they warn rather than block.
      'jsx-a11y/prefer-tag-over-role': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
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
        },
      },
    ],
  },
  staged: { '*': 'vp check --fix' },
});
