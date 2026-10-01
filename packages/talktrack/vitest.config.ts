import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only; the recording pipeline's own end-to-end coverage lives under test/e2e and runs through Playwright, not Vitest.
    include: ["test/unit/**/*.test.ts"],
  },
});
