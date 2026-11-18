import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import unusedImports from "eslint-plugin-unused-imports";

const TRANSITION_ALL_MESSAGE =
  "transition-all also animates the focus outline. Name the properties instead, e.g. transition-[color,background-color,scale].";
const noTransitionAll = [
  {
    selector: String.raw`Literal[value=/\btransition-all\b/]`,
    message: TRANSITION_ALL_MESSAGE,
  },
  {
    selector: String.raw`TemplateElement[value.cooked=/\btransition-all\b/]`,
    message: TRANSITION_ALL_MESSAGE,
  },
];

const ESCAPE_MESSAGE =
  "Register the overlay with useEscapeLayer, so one Escape closes only the top layer.";
const noBareEscape = [
  {
    selector: "BinaryExpression > Literal[value='Escape']",
    message: ESCAPE_MESSAGE,
  },
  {
    selector: "SwitchCase > Literal[value='Escape']",
    message: ESCAPE_MESSAGE,
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "unused-imports": unusedImports },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
        node: true,
      },
    },
    rules: {
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          pathGroups: [
            { pattern: "react", group: "external", position: "before" },
            { pattern: "next", group: "external", position: "before" },
            { pattern: "next/**", group: "external", position: "before" },
            { pattern: "@/**", group: "internal" },
          ],
          pathGroupsExcludedImportTypes: ["react"],
          "newlines-between": "always",
          distinctGroup: false,
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...noTransitionAll, ...noBareEscape],
    },
  },
  {
    files: ["src/components/use-escape-layer.ts"],
    rules: { "no-restricted-syntax": ["error", ...noTransitionAll] },
  },
  {
    // The image optimizer this rule steers toward is a metered hosting resource,
    // so artwork loads straight from the storefront's CDN through one component.
    files: ["src/components/track-artwork.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  prettier,
  {
    files: ["**/*.test.{ts,tsx}"],
    plugins: { vitest },
    rules: {
      "vitest/consistent-test-it": ["error", { fn: "test" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested worktrees are other checkouts, not this tree's source.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
