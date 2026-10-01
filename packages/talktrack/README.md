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

## Licence

MIT
