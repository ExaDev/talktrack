# talktrack

Narrated, cursor-driven demo recordings from Playwright. Playwright drives the page, talktrack makes the recording read like a person at the keyboard with someone talking over their shoulder: a visible cursor that glides, clicks and types at human speed, caption text timed to what was actually happening on screen, and a framed result with a header band above the app and the narration below it.

It works inside `@playwright/test` specs and from plain Node scripts, with the same helpers in both.

## Requirements

- Node 20 or newer
- `@playwright/test` 1.55 or newer (a peer dependency)
- `ffmpeg` and `ffprobe` on `PATH`. The framing pass shells out to them and needs the `libvpx-vp9` encoder, which a standard `brew install ffmpeg` or `apt-get install ffmpeg` includes. If either binary is missing, the error says so.

```sh
pnpm add -D talktrack
```

## In a Playwright test

```ts
import { test } from "@playwright/test";
import {
  finalizeFramedRecording,
  gotoWithCursor,
  installCursor,
  moveAndClick,
  narrateScene,
} from "talktrack";

const size = { width: 1440, height: 810 };
test.use({ viewport: size, video: { mode: "on", size } });

test("checkout demo", async ({ page }) => {
  await installCursor(page);
  await gotoWithCursor(page, "https://example.com");
  await narrateScene(page, "The page loads", () => page.getByRole("heading").waitFor());
  await moveAndClick(page, page.getByRole("link", { name: "More information" }));
});

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFramedRecording(page, testInfo);
});
```

Set the video `size` to the viewport size. Playwright otherwise scales the recording down to fit inside 800x800, the bands would no longer line up with the picture, and `finalizeFramedRecording` throws rather than produce a mis-laid-out file.

`finalizeFramedRecording` closes the page (Playwright only finalises a video once its page is closed), writes `<video>-framed.webm` next to the raw recording and attaches it to the test. It returns the framed path, or `undefined` when the run has no video.

## From a script

```ts
import { recordDemo } from "talktrack";

const demo = await recordDemo("checkout", {
  viewport: { width: 1440, height: 810 },
  url: "https://example.com",
});

await demo.narrateScene("The page loads", () => demo.page.getByRole("heading").waitFor());
await demo.moveAndClick(demo.page.getByRole("link", { name: "More information" }));
demo.caption("That is the whole flow");
await demo.beat(1500);
demo.hideCaption();

const framedPath = await demo.finish();
```

`recordDemo` launches Chromium (or uses the `browser` / `browserType` you pass), records at exactly the viewport size and writes to `talktrack-output/` unless you set `outputDir`. Call `finish()` once at the end: it closes the recording context so Playwright flushes the video, frames it and returns the path.

## Helpers

All take the `page` first in test mode; on a `recordDemo` session they are methods without it.

| Helper | What it does |
|---|---|
| `installCursor(page)` | Injects the cursor overlay and starts the recording clock. Call it first. |
| `gotoWithCursor(page, url)` / `reloadWithCursor(page)` | Navigate without the cursor snapping back to the corner. |
| `moveAndClick(page, locator, pauseMs?)` | Scrolls the target into view, glides the cursor to it along an eased, slightly curved path, clicks. |
| `fillVisibly(page, locator, text, pauseMs?)` | Clicks into the field and types character by character. |
| `naturalScrollIntoView(page, locator)` | Scrolls with real wheel events instead of an instant jump. |
| `showCaption(page, text)` / `hideCaption(page)` | Start and end a narration line. |
| `narrateScene(page, text, settle, opts?)` | Shows a caption, waits for `settle` (the real page condition the caption claims), holds a short dwell, hides it. |
| `beat(page, ms?)` | A jittered pause for reading time. |

Captions are timestamps, not an in-page overlay. Playwright records exactly the browser viewport, so anything the page draws is inside the recorded rectangle; the framing pass is what puts narration below the app.

## Framing and styling

The framed recording is the raw video padded onto a taller canvas: a static header band (the short commit hash and recording time by default, just the time outside a git repository) above the app, and a footer band that shows each caption for exactly the span it was on screen. The bands are rendered as PNGs by a throwaway browser context and composited with ffmpeg's `pad` and `overlay` filters, so no ffmpeg build with `drawtext` is needed.

Override any part of the look, and the header text:

```ts
await finalizeFramedRecording(page, testInfo, {
  headerText: "Checkout flow, v2",
  bands: { background: "#0b1020", footerHeightPx: 120, footerFontSizePx: 24 },
});
```

`bands` accepts any subset of `BandStyle`: `headerHeightPx`, `footerHeightPx`, `background`, `textColor`, `fontStack`, `headerFontSizePx`, `footerFontSizePx`. The same options exist on `recordDemo`.

## Development

TypeScript, pnpm, Turborepo, Playwright. You need Node 22 (see `.tool-versions`), the pnpm version in `packageManager`, and `ffmpeg` plus `ffprobe` with the `libvpx-vp9` encoder on `PATH`; the end-to-end suite needs them and nothing else does.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the e2e suite
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

`pnpm prepush` runs that whole matrix through turbo and is what the pre-push hook executes.

### Architecture

`src/` splits the pure halves (`human-path.ts` cursor geometry, `filter-graph.ts` caption windows and the ffmpeg filter graph, `timeline.ts` per-page narration events) from everything that touches a browser, the filesystem or ffmpeg (`cursor.ts`, `bands.ts`, `ffmpeg.ts`, `frame.ts`). The two adapters, `test-adapter.ts` (`finalizeFramedRecording`) and `standalone.ts` (`recordDemo`), are thin wrappers over `frameRecording`, so both driving modes produce identical output.

Tests are `test/unit/` (Vitest, pure modules) and `test/e2e/` (Playwright against `test/fixtures/demo-page.html`, driving both modes and probing the framed video with ffprobe).

### Conventions

- Turbo task names are the underscore-prefixed leaf commands (`_build`, `_lint`, ...). Run the public names (`pnpm lint`, `pnpm test`); they go through turbo and its cache.
- Conventional commits, enforced by commitlint in the `commit-msg` hook and in CI. Releases are cut from them by semantic-release on every push to `main` (`release.config.ts`); never bump the version or edit the changelog by hand.
- Dependencies are added through the package manager and pinned exactly (`saveExact`). Anything younger than the configured release age waits, except the org's own `@exadev/*` tooling package, which is exempt in `pnpm-workspace.yaml` and `.npmrc`.
- `AGENTS.md` and `CLAUDE.md` are symlinks to this file. Keep them that way.

### Releasing

Pushing to `main` runs the `release` job in `.github/workflows/ci.yml` after the required checks pass. It publishes to npm through trusted publishing (OIDC), so there is no npm token anywhere: the publisher is registered on npmjs.com for this repository and the `ci.yml` workflow. The release commit and tags are pushed to `main` straight from the job, which the ruleset on `main` otherwise forbids, so the job checks out with the repository's write deploy key (secret `RELEASE_DEPLOY_KEY`), the one actor the ruleset lets bypass its pull-request requirement. `release.config.ts` names the SSH repository URL so semantic-release pushes through that key rather than over HTTPS with the workflow token. Tags are `talktrack@<version>`, continuing from `talktrack@0.0.0`, the tag that marks the stub the npm name was reserved with.

### Gotchas

- The framing pass needs the recording to be exactly viewport-sized. In `@playwright/test`, set `video: { mode: "on", size }` to the viewport size; Playwright otherwise scales the video down and `finalizeFramedRecording` throws rather than produce a mis-laid-out file.
- `finalizeFramedRecording` closes the page. Playwright only finalises a video once its page is closed, so the adapter does it itself; call it from `afterEach`, not mid-test.
- Do not set `registry-url` in `actions/setup-node` anywhere: it writes an `_authToken` line that wins over the OIDC exchange and silently breaks publishing.
- The ESLint config bans inline `eslint-disable` comments. Fix the code or restructure the test (for example `test.info()` instead of an empty destructuring pattern).

## Licence

MIT
