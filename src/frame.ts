import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, type Page } from "@playwright/test";
import { renderTextBand, resolveBandStyle, type BandStyle } from "./bands";
import { assertVideoMatchesViewport, probeVideo, runFfmpeg } from "./ffmpeg";
import { buildFramePlan, captionWindows } from "./filter-graph";
import { getRecordingTimeline } from "./timeline";

// The framing pass. Playwright's video recorder captures exactly the browser viewport's own pixels, so an in-page "narrate below the app" or "commit/date above the app" banner is a contradiction in terms: anything the page itself renders is, by definition, inside the recorded viewport. This module produces that layout as a genuinely separate post-processing pass instead: the raw recording stays exactly the app's own window, and frameRecording pads a taller canvas around it (a static header band and a footer band that shows each narration line only for the real span of time it was actually on screen during the run). ffmpeg's own pad+overlay filters do the compositing.

/**
 * Everything the framing pass needs. Both adapters (the Playwright Test one and the standalone runner) reduce to this: a flushed raw recording, the viewport it was recorded at, a live browser to render band PNGs through, and where to write the framed copy.
 */
export interface FrameRecordingInput {
  // Timeline source. Read after the context has closed is fine: the state is keyed by the Page object itself, which outlives its context.
  page: Page;
  // Path to the raw recording, already flushed to disk (Playwright Test flushes it before afterEach; the standalone runner closes the context first).
  videoPath: string;
  // The recorded viewport, captured before the context closed (page.viewportSize() throws on a closed page).
  viewport: { width: number; height: number };
  // Band PNGs are rendered through a throwaway context on this browser (see renderTextBand).
  browser: Browser;
  headerText: string | Promise<string>;
  framedPath: string;
  bands?: Partial<BandStyle>;
}

/**
 * The default header band: the word "commit", the short sha, a middot, and the ISO recording-start timestamp, or just the timestamp when not inside a git working tree (demos run from anywhere, not only repos).
 */
export async function defaultHeaderText(startedAtMs: number): Promise<string> {
  const createdAtIso = new Date(startedAtMs).toISOString();
  try {
    const sha = await new Promise<string>((resolve, reject) => {
      execFile("git", ["rev-parse", "--short", "HEAD"], (error, stdout) => {
        if (error) reject(new Error(error.message, { cause: error }));
        else resolve(stdout.trim());
      });
    });

    return `commit ${sha} · ${createdAtIso}`;
  } catch {
    return createdAtIso;
  }
}

/**
 * Frames one raw recording: renders the header and caption band PNGs, probes the raw video's duration, and composites everything into {@link FrameRecordingInput.framedPath} with ffmpeg. Returns that path.
 */
export async function frameRecording(
  input: Readonly<FrameRecordingInput>,
): Promise<string> {
  const style = resolveBandStyle(input.bands);
  const timeline = getRecordingTimeline(input.page);
  const facts = await probeVideo(input.videoPath);
  assertVideoMatchesViewport(facts, input.viewport, input.videoPath);
  const windows = captionWindows(timeline.events, facts.durationMs);
  const plan = buildFramePlan(input.viewport, style, windows);

  // Deliberately separate from the demo's own recording context (see renderTextBand's own comment for why).
  const bandContext = await input.browser.newContext();
  const workDir = await mkdtemp(join(tmpdir(), "talktrack-frame-"));
  try {
    const inputArgs: string[] = ["-i", input.videoPath];
    const headerPngPath = join(workDir, "header.png");
    await writeFile(
      headerPngPath,
      await renderTextBand(bandContext, style, {
        width: input.viewport.width,
        height: style.headerHeightPx,
        fontSizePx: style.headerFontSizePx,
        text: await input.headerText,
      }),
    );
    inputArgs.push("-i", headerPngPath);
    for (const [i, window] of windows.entries()) {
      const captionPngPath = join(workDir, `caption-${String(i)}.png`);
      await writeFile(
        captionPngPath,
        await renderTextBand(bandContext, style, {
          width: input.viewport.width,
          height: style.footerHeightPx,
          fontSizePx: style.footerFontSizePx,
          text: window.text,
        }),
      );
      inputArgs.push("-i", captionPngPath);
    }

    await runFfmpeg([
      "-y",
      ...inputArgs,
      "-filter_complex",
      plan.filterGraph,
      "-map",
      `[${plan.finalLabel}]`,
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "32",
      "-b:v",
      "0",
      "-deadline",
      "good",
      "-cpu-used",
      "3",
      input.framedPath,
    ]);

    return input.framedPath;
  } finally {
    await bandContext.close();
    await rm(workDir, { recursive: true, force: true });
  }
}
