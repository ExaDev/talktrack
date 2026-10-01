import { exadevConfig } from "@exadev/eslint-config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default exadevConfig(
  {},
  {
    ignores: [
      "node_modules",
      "dist",
      "coverage",
      ".turbo",
      ".eslintcache",
      "test-results",
      "playwright-report",
      "talktrack-output",
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
  },
  {
    // TypeScript files only: the rule needs the plugin bound in this same config object (the exadev config's own objects don't make it available to later sibling objects), and applying it to JSON configs would run it without the TS parser's type information.
    files: ["**/*.ts"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },
  eslintPluginPrettierRecommended,
);
