import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm", "cjs"],
  // fixedExtension: false keeps the ESM output at dist/index.js (not index.mjs), matching the package's own exports map ("./dist/index.js" for import, "./dist/index.cjs" for require, "./dist/index.d.ts" for types) rather than the .mjs/.d.mts names tsdown otherwise fixedly emits for a "type": "module" package.
  fixedExtension: false,
  // The Playwright peer dependency stays external in both output formats; nothing here should ever be bundled into a consumer's install.
  external: [/^@playwright\/test$/, /^playwright/],
  sourcemap: true,
  clean: true,
});
