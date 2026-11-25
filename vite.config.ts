import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    printWidth: 80,
    singleQuote: true,
    sortImports: true,
    sortTailwindcss: { stylesheet: './src/app/globals.css' },
    ignorePatterns: [
      'pnpm-lock.yaml',
      'public/**',
      // Vendored upstream; formatting them buries real changes in the next sync diff
      '.claude/skills/**',
      '.claude/worktrees/**',
      '.autopilot/**',
    ],
  },
  lint: {
    plugins: [
      'typescript',
      'unicorn',
      'oxc',
      'react',
      'jsx-a11y',
      'nextjs',
      'import',
      'vitest',
    ],
    categories: { correctness: 'error' },
    ignorePatterns: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      '.claude/worktrees/**',
    ],
    jsPlugins: ['./scripts/lint-plugin.ts'],
    rules: {
      // react.dev eslint-plugin-react-hooks recommended; oxlint files these under pedantic/restriction
      'react/rules-of-hooks': 'error',
      'react/unsupported-syntax': 'error',
      'react/react-in-jsx-scope': 'off',
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
      // eslint-config-next
      'import/no-anonymous-default-export': 'error',
      'eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Existing mocks predate this rule; turn it on once they carry type parameters.
      'vitest/require-mock-type-parameters': 'off',
      // Tests narrow a result union with `if (result.ok)` after asserting its tag.
      'vitest/no-conditional-expect': 'off',
      // Schema tests assert that input is rejected, not the validator's wording.
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
        rules: { 'vitest/consistent-test-it': ['error', { fn: 'test' }] },
      },
    ],
  },
  staged: { '*': 'vp check --fix' },
});
