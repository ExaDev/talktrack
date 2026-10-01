import { expect, test } from "@playwright/test";
import { defaultBandStyle } from "../../src/bands";
import {
  fillVisibly,
  finalizeFramedRecording,
  gotoWithCursor,
  installCursor,
  moveAndClick,
  narrateScene,
} from "../../src/index";
import { probeVideo } from "../../src/ffmpeg";

const VIEWPORT = { width: 1280, height: 720 } as const;
const fixtureUrl = new URL("../fixtures/demo-page.html", import.meta.url).href;

// The recording size is the viewport size: without `size`, Playwright scales the video down to fit inside 800x800 and the bands would no longer line up with the picture (the framing pass rejects that outright).
test.use({ video: { mode: "on", size: VIEWPORT }, viewport: VIEWPORT });

// The engine's own proof it works inside the test runner it was extracted from: a real narrated interaction, then the adapter's framing pass probed for exactly the layout it promises.
test("records a narrated demo and frames it", async ({ page }) => {
  await installCursor(page);
  await gotoWithCursor(page, fixtureUrl);
  await narrateScene(page, "A small page with two buttons", async () =>
    page.locator("#first").waitFor(),
  );
  await moveAndClick(page, page.locator("#first"));
  await narrateScene(page, "Clicking increments the counter", async () => {
    await expect(page.locator("#counter")).toHaveText("1");
  });
  await fillVisibly(page, page.locator("#name"), "talktrack");
  await narrateScene(page, "Typed like a person, not pasted", async () =>
    expect(page.locator("#name")).toHaveValue("talktrack"),
  );
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) return;
  const framed = await finalizeFramedRecording(page, testInfo);
  if (framed === undefined) {
    throw new Error(
      "finalizeFramedRecording returned undefined despite video being enabled",
    );
  }
  const facts = await probeVideo(framed);
  expect(facts.width).toBe(VIEWPORT.width);
  expect(facts.height).toBe(
    VIEWPORT.height +
      defaultBandStyle.headerHeightPx +
      defaultBandStyle.footerHeightPx,
  );
  expect(facts.durationMs).toBeGreaterThan(0);
});
