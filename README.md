# talktrack

> Narrated, cursor-driven demo recordings from Playwright, usable inside `@playwright/test` specs and from standalone scripts. This repository is the workspace around the published package; what it does and how to use it is in [`packages/talktrack/README.md`](packages/talktrack/README.md).

TypeScript · pnpm workspace · Turborepo · Playwright · ffmpeg

## Getting started

Prerequisites: Node 22 (see `.tool-versions`), pnpm (the version in `packageManager`), and `ffmpeg` plus `ffprobe` on `PATH` with the `libvpx-vp9` encoder. The end-to-end suite and anything that records a demo need them; everything else does not.

```sh
pnpm install
pnpm exec --dir packages/talktrack playwright install chromium   # once, for the e2e suite
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

`pnpm prepush` runs that whole matrix through turbo and is what the pre-push hook executes.

## Architecture

- `packages/talktrack/`: the only published package. `src/` splits the pure halves (`human-path.ts` cursor geometry, `filter-graph.ts` caption windows and the ffmpeg filter graph, `timeline.ts` per-page narration events) from everything that touches a browser, the filesystem or ffmpeg (`cursor.ts`, `bands.ts`, `ffmpeg.ts`, `frame.ts`). The two adapters, `test-adapter.ts` (`finalizeFramedRecording`) and `standalone.ts` (`recordDemo`), are thin wrappers over `frameRecording`, so both driving modes produce identical output.
- Root: the workspace itself. It holds the shared lint, commit and release configuration, the turbo pipeline, and nothing that ships.
- Tests: `test/unit/` (Vitest, pure modules) and `test/e2e/` (Playwright against `test/fixtures/demo-page.html`, driving both modes and probing the framed video with ffprobe).

## Conventions

- Turbo task names are the underscore-prefixed leaf commands (`_build`, `_lint`, ...). Run the public names (`pnpm lint`, `pnpm test`) from the root; they go through turbo and its cache.
- Conventional commits, enforced by commitlint in the `commit-msg` hook and in CI. Releases are cut from them by `@exadev/semantic-release-workspace` on every push to `main` (`release-workspace.config.ts`); never bump versions or edit the changelog by hand.
- Dependencies are added through the package manager and pinned exactly (`saveExact`). Anything younger than the configured release age waits, except the org's own `@exadev/*` tooling packages, which are exempt in `pnpm-workspace.yaml` and `.npmrc`.
- `AGENTS.md` and `CLAUDE.md` are symlinks to this file. Keep them that way.

## Releasing

Pushing to `main` runs the `release` job in `.github/workflows/ci.yml` after the required checks pass. It publishes to npm through trusted publishing (OIDC), so there is no npm token anywhere: the publisher is registered on npmjs.com for this repository and the `ci.yml` workflow. The first release continues from the `talktrack@0.0.0` tag, which marks the reservation stub the name was registered with.

## Gotchas

- The framing pass needs the recording to be exactly viewport-sized. In `@playwright/test`, set `video: { mode: "on", size }` to the viewport size; Playwright otherwise scales the video down and `finalizeFramedRecording` throws rather than produce a mis-laid-out file.
- `finalizeFramedRecording` closes the page. Playwright only finalises a video once its page is closed, so the adapter does it itself; call it from `afterEach`, not mid-test.
- Do not set `registry-url` in `actions/setup-node` anywhere: it writes an `_authToken` line that wins over the OIDC exchange and silently breaks publishing.
- The ESLint config bans inline `eslint-disable` comments. Fix the code or restructure the test (for example `test.info()` instead of an empty destructuring pattern).
