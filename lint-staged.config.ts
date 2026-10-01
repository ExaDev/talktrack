import type { Configuration } from "lint-staged";

// ESLint's flat config resolves from the working directory, so a single invocation at the repository root lints every staged TypeScript file against the one config.
const config: Configuration = {
  "*.ts": "eslint --fix --max-warnings 0",
};

export default config;
