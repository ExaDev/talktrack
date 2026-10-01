import type { ReleaseWorkspaceOptions } from "@exadev/semantic-release-workspace";

interface CommitType {
  type: string;
  release: "major" | "minor" | "patch";
  section: string;
}

/**
 * The commit types this repo releases on, shared by release-workspace.config.ts (release rules and changelog sections) and commitlint.config.ts (the type-enum rule). Defined here rather than in a shared commit-types.ts: this file is loaded through cosmiconfig, which transpiles only the file it loads, so a sibling .ts module would not resolve from it. commitlint's jiti loader has no such limit, so it imports commitTypes from here.
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
 * Runs on `main`, once per push, through `@exadev/semantic-release-workspace` rather than semantic-release directly.
 *
 * The orchestrator discovers every package from pnpm-workspace.yaml, orders them so a package releases only after each workspace sibling it depends on has, and runs semantic-release per package with the commit list path-filtered to that package's own directory and its tags in `name@version` form, so each package's version tracks its own history.
 *
 * The npm name `talktrack` carries a 0.0.0 reservation stub published when the name was reserved, so the initial commit is tagged `talktrack@0.0.0`: semantic-release derives the previous version from the last tag matching that format, and without one it would find nothing and open the package's history at 1.0.0 instead of continuing on from the stub. With the tag, the first release of the ported engine lands as 0.1.0.
 *
 * `commitStrategy: "single"` produces one commit for the whole run (every version bump, changelog write, and dependency-range rewrite together) instead of one commit per released package plus one per bump. `@semantic-release/git` is deliberately absent from the plugin list because of it: that plugin's own prepare step would make exactly the per-package commit this mode exists to replace, and the orchestrator rejects the combination outright rather than producing both.
 */
const config: Pick<
  ReleaseWorkspaceOptions,
  "branches" | "commitStrategy" | "plugins" | "analyzeCommits" | "generateNotes"
> = {
  branches: ["main"],
  commitStrategy: "single",
  plugins: [
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: true }],
    // successComment overrides @semantic-release/github's own default ("This PR is included in version ${nextRelease.version}"), which names only a bare version with no package, meaningless on a PR that several independently-versioned packages can release from at once. `nextRelease.gitTag` is this orchestrator's own `name@version` tag format, so the comment names which package's release it is, not just which version.
    [
      "@semantic-release/github",
      {
        successComment: `:tada: This <%= issue.pull_request ? 'PR is included' : 'issue has been resolved' %> in **<%= nextRelease.gitTag %>** :tada:
<% if (releases.length > 0) { %>
The release is available on:
<% releases.forEach((release) => { %>- [<%= release.name %>](<%= release.url %>)
<% }); %><% } %>
Your **[semantic-release](https://github.com/semantic-release/semantic-release)** bot :package::rocket:`,
      },
    ],
  ],
  analyzeCommits: {
    preset: "conventionalcommits",
    releaseRules: [
      { breaking: true, release: "major" },
      ...commitTypes.map(({ type, release }) => ({ type, release })),
    ],
  },
  generateNotes: {
    // The conventionalcommits preset, not angular: it is the one that groups the changelog by commit type, and the presetConfig below names every type's section. It renders only against conventional-changelog-writer 9 or newer, which @semantic-release/release-notes-generator does not itself depend on: see the pnpm override that supplies it.
    preset: "conventionalcommits",
    presetConfig: {
      types: commitTypes.map(({ type, section }) => ({ type, section })),
    },
  },
};

export default config;
