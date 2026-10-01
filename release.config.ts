import type { GlobalConfig } from "semantic-release";

interface CommitType {
  type: string;
  release: "major" | "minor" | "patch";
  section: string;
}

/**
 * The commit types this repo releases on, shared by this file (release rules and changelog sections) and commitlint.config.ts (the type-enum rule). Defined here rather than in a shared module because semantic-release loads this file through cosmiconfig, which transpiles only the file it loads, so a sibling .ts module would not resolve from it. commitlint's own loader has no such limit, so it imports commitTypes from here.
 */
export const commitTypes: readonly CommitType[] = [
  { type: "feat", release: "minor", section: "Features" },
  { type: "fix", release: "patch", section: "Bug Fixes" },
  { type: "perf", release: "patch", section: "Performance Improvements" },
  { type: "revert", release: "patch", section: "Reverts" },
  { type: "refactor", release: "patch", section: "Code Refactoring" },
  { type: "docs", release: "patch", section: "Documentation" },
  { type: "style", release: "patch", section: "Styles" },
  { type: "test", release: "patch", section: "Tests" },
  { type: "build", release: "patch", section: "Build System" },
  { type: "ci", release: "patch", section: "Continuous Integration" },
  { type: "chore", release: "patch", section: "Miscellaneous Chores" },
];

/**
 * Runs on `main`, once per push, from the release job in .github/workflows/ci.yml.
 *
 * repositoryUrl is the SSH form on purpose. semantic-release otherwise prefers the repository URL in package.json, an HTTPS one, and pushes to it with GITHUB_TOKEN, which the ruleset on `main` refuses. The SSH URL makes it push over the SSH remote the release job's checkout configured, authenticated by the repository's write deploy key, the one actor the ruleset lets bypass its pull-request requirement.
 *
 * The tag format keeps the `talktrack@<version>` shape the repository's tags already use, including the `talktrack@0.0.0` tag that marks the npm name's reservation stub, so the next version derives from the last release instead of restarting at 1.0.0.
 */
const config: GlobalConfig = {
  branches: ["main"],
  repositoryUrl: "git@github.com:ExaDev/talktrack.git",
  tagFormat: "talktrack@${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { breaking: true, release: "major" },
          ...commitTypes.map(({ type, release }) => ({ type, release })),
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        // The conventionalcommits preset, not angular: it is the one that groups the changelog by commit type, and the presetConfig below names every type's section. It renders only against conventional-changelog-writer 9 or newer, which @semantic-release/release-notes-generator does not itself depend on: see the pnpm override that supplies it.
        preset: "conventionalcommits",
        presetConfig: {
          types: commitTypes.map(({ type, section }) => ({ type, section })),
        },
      },
    ],
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: true }],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};

export default config;
