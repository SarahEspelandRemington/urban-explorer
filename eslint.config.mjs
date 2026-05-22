import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { plugin as noPiiInSentryPlugin } from "./eslint-rules/no-pii-in-sentry.mjs";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/generated/**",
      "lib/api-zod/**",
      "lib/api-client-react/**",
      "artifacts/mockup-sandbox/**",
      "**/*.config.{js,mjs,cjs,ts}",
      "**/build.mjs",
      "**/serve.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Promoted from "warn": detects dead writes that are always overwritten; must fix.
      "no-useless-assignment": "error",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: ["artifacts/urban-explorer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, local: noPiiInSentryPlugin },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Promoted from "warn": missing deps cause stale-closure bugs; must fix.
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-explicit-any": "off",
      // Promoted from "warn": unused variables indicate dead code; must fix.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Promoted from "warn": empty blocks hide swallowed errors; must fix.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Promoted from "warn": PII leaks to Sentry are a privacy violation; must fix.
      "local/no-pii-in-sentry": "error",
    },
  },
  {
    files: ["artifacts/api-server/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Promoted from "warn": unused variables indicate dead code; must fix.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "**/__tests__/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
