import { expect, test } from "@playwright/test";
import { defaultBandStyle } from "../../src/bands";
import { probeVideo } from "../../src/ffmpeg";
import { recordDemo } from "../../src/index";

const VIEWPORT = { width: 1280, height: 720 } as const;
// Long enough for the closing caption to span a real stretch of the recording, so its window is non-trivial.
const CLOSING_CAPTION_HOLD_MS = 800;
const fixtureUrl = new URL("../fixtures/demo-page.html", import.meta.url).href;

// The engine's own proof it works with no test runner involved: the standalone session manages its own browser and recording context, and finish() returns a framed webm probed for exactly the layout it promises. The callback takes no parameters because Playwright requires an object-destructuring pattern for any first parameter and this session wants no fixtures; TestInfo comes from test.info() instead. outputDir lands inside it so Playwright cleans the raw video up with the run.
test("recordDemo produces a framed recording from a standalone session", async () => {
  const demo = await recordDemo("standalone-demo", {
    viewport: VIEWPORT,
    url: fixtureUrl,
    outputDir: test.info().outputDir,
  });
  await demo.narrateScene("Driven without a test runner", async () =>
    demo.page.locator("#first").waitFor(),
  );
  await demo.moveAndClick(demo.page.locator("#first"));
  await demo.fillVisibly(demo.page.locator("#name"), "standalone");
  demo.caption("That is the whole session");
  await demo.beat(CLOSING_CAPTION_HOLD_MS);
  demo.hideCaption();

  const framed = await demo.finish();
  const facts = await probeVideo(framed);
  expect(facts.width).toBe(VIEWPORT.width);
  expect(facts.height).toBe(
    VIEWPORT.height +
      defaultBandStyle.headerHeightPx +
      defaultBandStyle.footerHeightPx,
  );
  expect(facts.durationMs).toBeGreaterThan(0);
});
