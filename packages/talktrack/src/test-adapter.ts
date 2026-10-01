import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, type TestInfo } from "@playwright/test";
import { type BandStyle } from "./bands";
import { defaultHeaderText, frameRecording } from "./frame";
import { getRecordingTimeline } from "./timeline";

// The @playwright/test adapter. Call from afterEach: it closes the spec's page so Playwright finalises the video, frames the recording, and attaches the framed copy next to the raw one as a test attachment.

/**
 * Optional overrides for {@link finalizeFramedRecording}: the header band's text, partial band styling, and where the framed copy is written (default: next to the raw video, with a -framed suffix).
 */
export interface FinalizeOptions {
  headerText?: string | Promise<string>;
  bands?: Partial<BandStyle>;
  framedPath?: string;
}

/**
 * Produces a taller, framed copy of the just-recorded spec video: the app window exactly as recorded, a static header above it, and a footer below it showing each narration line only while it was actually shown during the run. A no-op returning undefined (not a failure) when there's no video to frame at all (a spec run without video enabled) or no viewport to size bands against.
 *
 * Closes the page. Playwright only finalises a page's video once the page is closed, and an afterEach hook runs while the test's page is still open, so the recording on disk is incomplete until then: the adapter closes the page itself and waits for the finalised video (video.saveAs waits for exactly that) before reading it. The page is unusable afterwards, which is why this belongs in afterEach and not mid-test.
 */
export async function finalizeFramedRecording(
  page: Page,
  testInfo: TestInfo,
  opts?: FinalizeOptions,
): Promise<string | undefined> {
  const video = page.video();
  if (!video) return undefined;
  const viewport = page.viewportSize();
  if (!viewport) return undefined;
  const browser = page.context().browser();
  if (!browser)
    throw new Error(
      "talktrack cannot frame this recording: a persistent browser context has no separate Browser handle to render caption bands through",
    );

  // Only used for naming the framed copy: path() reports where the video is being written without waiting for it to finish.
  const rawPath = await video.path();
  const framedPath =
    opts?.framedPath ?? rawPath.replace(/\.webm$/, "-framed.webm");
  const headerText =
    opts?.headerText ?? defaultHeaderText(getRecordingTimeline(page).startedAt);

  const scratchDir = await mkdtemp(join(tmpdir(), "talktrack-raw-"));
  try {
    await page.close();
    const finalisedRawPath = join(scratchDir, "raw.webm");
    await video.saveAs(finalisedRawPath);

    await frameRecording({
      page,
      videoPath: finalisedRawPath,
      viewport,
      browser,
      headerText,
      framedPath,
      ...(opts?.bands ? { bands: opts.bands } : {}),
    });
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
  await testInfo.attach("framed-recording", {
    path: framedPath,
    contentType: "video/webm",
  });

  return framedPath;
}
