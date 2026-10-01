import type { BandStyle } from "./bands";
import type { CaptionEvent } from "./timeline";

// The pure half of the framing pass: turning a caption timeline into (a) concrete on-screen windows and (b) an ffmpeg filter graph, with no browser, no filesystem and no ffmpeg involved. Everything here is unit-testable; everything that touches the outside world lives in frame.ts.

export interface CaptionWindow {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * A window opens at each show event and closes at whatever event follows it (an explicit hide, or a subsequent show replacing the line), or at the video's own end if nothing follows. A hide event only ever closes the preceding show's window: it opens no window of its own.
 */
export function captionWindows(
  events: readonly CaptionEvent[],
  videoDurationMs: number,
): CaptionWindow[] {
  const windows: CaptionWindow[] = [];
  for (const [i, event] of events.entries()) {
    if (event.text === null) continue;
    const nextEvent = events[i + 1];
    windows.push({
      text: event.text,
      startMs: event.atMs,
      endMs: nextEvent === undefined ? videoDurationMs : nextEvent.atMs,
    });
  }

  return windows;
}

const MS_PER_SECOND = 1000;
// ffmpeg's between(t,start,end) expression accepts fractional seconds; millisecond precision is more than enough for a narration cue.
const FFMPEG_TIME_DECIMAL_PLACES = 3;

/** The ffmpeg inputs and filter graph one framing pass drives: how many -i inputs the command takes, the graph string itself, and the label its final overlay writes. */
export interface FramePlan {
  inputCount: number;
  filterGraph: string;
  finalLabel: string;
}

/**
 * Input 0 is the raw recording, input 1 the header band PNG, inputs 2.. the caption band PNGs in window order. The graph pads input 0 onto a taller canvas of band colour (header band above, footer band below), overlays the header at the top, then chains one time-gated overlay per caption window onto the footer region.
 */
export function buildFramePlan(
  viewport: Readonly<{ width: number; height: number }>,
  style: Readonly<BandStyle>,
  windows: readonly CaptionWindow[],
): FramePlan {
  const padHeight =
    viewport.height + style.headerHeightPx + style.footerHeightPx;
  let filterGraph = `[0:v]pad=${String(viewport.width)}:${String(padHeight)}:0:${String(style.headerHeightPx)}:color=${style.background}[bg];[bg][1:v]overlay=0:0[v0]`;
  let lastLabel = "v0";

  let inputIndex = 2;
  for (const [i, window] of windows.entries()) {
    const startS = (window.startMs / MS_PER_SECOND).toFixed(
      FFMPEG_TIME_DECIMAL_PLACES,
    );
    const endS = (window.endMs / MS_PER_SECOND).toFixed(
      FFMPEG_TIME_DECIMAL_PLACES,
    );
    const nextLabel = `v${String(i + 1)}`;
    filterGraph += `;[${lastLabel}][${String(inputIndex)}:v]overlay=0:${String(style.headerHeightPx + viewport.height)}:enable='between(t,${startS},${endS})'[${nextLabel}]`;
    lastLabel = nextLabel;
    inputIndex++;
  }

  return { inputCount: inputIndex, filterGraph, finalLabel: lastLabel };
}
