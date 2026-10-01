import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type BrowserType,
  type LaunchOptions,
  type Locator,
  chromium,
  type Page,
} from "@playwright/test";
import { type BandStyle } from "./bands";
import {
  beat,
  fillVisibly,
  gotoWithCursor,
  hideCaption,
  installCursor,
  moveAndClick,
  narrateScene,
  naturalScrollIntoView,
  reloadWithCursor,
  showCaption,
} from "./cursor";
import { defaultHeaderText, frameRecording } from "./frame";
import { getRecordingTimeline } from "./timeline";

// The standalone runner: everything installCursor/narrateScene give a @playwright/test spec, but from a plain script with no test runner involved. recordDemo launches (or borrows) a browser, opens a video-recording context, installs the cursor, and returns the same helper surface bound to that page; finish() closes the context (which flushes Playwright's webm), runs the framing pass, and returns the framed recording's path.

/**
 * Everything recordDemo needs: the recorded viewport, where to start, where outputs go, and optional overrides for the browser, context, header band, and band styling.
 */
export interface RecordDemoOptions {
  // Recorded viewport. Playwright records exactly this rectangle; 16:9 ratios frame cleanly.
  viewport: { width: number; height: number };
  // Initial navigation; omit to drive the page entirely by hand.
  url?: string;
  // Where Playwright writes the raw recording and talktrack writes the framed one. Default: talktrack-output under the working directory.
  outputDir?: string;
  // Bring your own browser (shared across demos); by default one is launched per recordDemo call and closed by finish().
  browser?: Browser;
  // Which browser to launch when `browser` is not supplied. Default: chromium.
  browserType?: BrowserType<Browser>;
  launchOptions?: LaunchOptions;
  // Extra context options (locale, colorScheme, ...). recordVideo and viewport are owned by the runner.
  contextOptions?: Omit<BrowserContextOptions, "recordVideo" | "viewport">;
  headerText?: string | Promise<string>;
  bands?: Partial<BandStyle>;
}

/**
 * The bound helper surface recordDemo returns: the cursor/narration helpers a spec gets, wrapped around one recording page, plus {@link TalktrackSession.finish} to flush and frame the video.
 */
export interface TalktrackSession {
  readonly page: Page;
  readonly context: BrowserContext;
  moveAndClick: (locator: Readonly<Locator>, pauseMs?: number) => Promise<void>;
  fillVisibly: (
    locator: Readonly<Locator>,
    text: string,
    pauseMs?: number,
  ) => Promise<void>;
  naturalScrollIntoView: (locator: Readonly<Locator>) => Promise<void>;
  goto: (url: string) => Promise<void>;
  reload: () => Promise<void>;
  caption: (text: string) => void;
  hideCaption: () => void;
  narrateScene: <T>(
    text: string,
    settle: () => Promise<T>,
    opts?: { leadInMs?: number; dwellMs?: number },
  ) => Promise<T>;
  beat: (ms?: number) => Promise<void>;
  // Closes the recording context, frames the raw video, closes the browser if this session launched it, and returns the framed recording's path. Call exactly once, at the end.
  finish: () => Promise<string>;
}

/**
 * Starts one standalone demo recording: launches (or borrows) a browser, opens a video-recording context at the given viewport, installs the cursor, optionally navigates to `url`, and returns the session. Drive the page through the session's helpers, then `await session.finish()` once; it returns the framed recording's path.
 */
export async function recordDemo(
  name: string,
  opts: Readonly<RecordDemoOptions>,
): Promise<TalktrackSession> {
  const outputDir = opts.outputDir ?? join(process.cwd(), "talktrack-output");
  await mkdir(outputDir, { recursive: true });

  const ownsBrowser = opts.browser === undefined;
  const browser =
    opts.browser ??
    (await (opts.browserType ?? chromium).launch(opts.launchOptions ?? {}));
  const context = await browser.newContext({
    ...opts.contextOptions,
    viewport: opts.viewport,
    recordVideo: { dir: outputDir, size: opts.viewport },
  });
  const page = await context.newPage();
  await installCursor(page);
  if (opts.url !== undefined) await gotoWithCursor(page, opts.url);

  const finish = async (): Promise<string> => {
    // Captured before close: both throw on a closed context/page, and the framing pass needs them after the video is flushed.
    const viewport = page.viewportSize();
    if (!viewport)
      throw new Error(
        "talktrack could not read the viewport before closing the demo's context",
      );
    const video = page.video();
    if (!video)
      throw new Error("talktrack's recording context produced no video handle");

    const videoPathPromise = video.path();
    await context.close();
    const videoPath = await videoPathPromise;

    const framedPath = join(outputDir, `${name}-framed.webm`);
    const headerText =
      opts.headerText ??
      defaultHeaderText(getRecordingTimeline(page).startedAt);
    const framed = await frameRecording({
      page,
      videoPath,
      viewport,
      browser,
      headerText,
      framedPath,
      ...(opts.bands ? { bands: opts.bands } : {}),
    });
    if (ownsBrowser) await browser.close();

    return framed;
  };

  return {
    page,
    context,
    moveAndClick: async (locator, pauseMs) =>
      moveAndClick(page, locator, pauseMs),
    fillVisibly: async (locator, text, pauseMs) =>
      fillVisibly(page, locator, text, pauseMs),
    naturalScrollIntoView: async (locator) =>
      naturalScrollIntoView(page, locator),
    goto: async (url) => gotoWithCursor(page, url),
    reload: async () => reloadWithCursor(page),
    caption: (text) => {
      showCaption(page, text);
    },
    hideCaption: () => {
      hideCaption(page);
    },
    narrateScene: async (text, settle, narrateOpts) =>
      narrateScene(page, text, settle, narrateOpts),
    beat: async (ms) => beat(page, ms),
    finish,
  };
}
