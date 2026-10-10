import { exadevConfig } from "@exadev/eslint-config";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  ...exadevConfig(),
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
      "CHANGELOG.md",
      "pnpm-lock.yaml",
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
  {
    // src/cursor.ts: cursor glides, wheel scrolls, keystrokes and cursor re-application are paced input events whose whole point is that each one lands before the next starts, so running the iterations together would defeat them. src/frame.ts: the caption bands are rendered on one shared browser context and are rendered one after another to keep resource use bounded.
    files: ["src/cursor.ts", "src/frame.ts"],
    rules: { "no-await-in-loop": "off" },
  },
);
