import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  // A demo recording is wall-clock slow by construction (glides, typing, narration dwell): each one runs tens of seconds even on a trivial fixture page.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI !== undefined ? [["github"], ["list"]] : "list",
  outputDir: "test-results",
  use: {
    // The test-mode spec overrides video per test; the default stays off so the standalone spec (which manages its own browser) records nothing extra.
    video: "off",
  },
});
