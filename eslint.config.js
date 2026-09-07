import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "context/**",
      "evals/golden/**",
      "evals/results/**",
      "evals/cases/**",
      "docs/**",
      "**/*.config.ts",
      "**/*.config.js",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "packages/**/src/**/*.ts",
      "packages/**/scripts/**/*.ts",
      "packages/**/test/**/*.ts",
      "evals/runner/**/*.ts",
      "evals/scorers/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
