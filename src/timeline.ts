import { type Page } from "@playwright/test";

// The narration timeline behind the footer band: each showCaption/hideCaption call is timestamped against the recording's own start, and the framing pass later turns that event list into "this text was on screen from here to here" overlay windows. Keeping it as per-page WeakMap state (rather than threading it through every helper signature) is what lets both the test-runner adapter and the standalone runner share one helper surface.

export interface CaptionEvent {
  atMs: number;
  text: string | null;
}

export interface RecordingTimeline {
  startedAt: number;
  events: CaptionEvent[];
}

// Per-page recording start time (t0) and narration timeline, keyed the way cursor positions are (see cursor.ts): per-page state that must survive across many helper calls without being threaded through every function signature.
const recordingStartedAt = new WeakMap<Page, number>();
const captionTimeline = new WeakMap<Page, CaptionEvent[]>();

/**
 * Called once, as early as possible (installCursor's own first line). First call wins, so a demo that navigates before installing the overlay doesn't shift t0 later than the recording's own real start.
 */
export function markRecordingStart(page: Page): void {
  if (!recordingStartedAt.has(page)) recordingStartedAt.set(page, Date.now());
}

/**
 * Appends one narration event for the page: a string shows that caption from now, null hides whatever is showing. Called by showCaption/hideCaption; direct use is only for advanced driving.
 */
export function recordCaptionEvent(page: Page, text: string | null): void {
  const startedAt = recordingStartedAt.get(page) ?? Date.now();
  const events = captionTimeline.get(page) ?? [];
  events.push({ atMs: Date.now() - startedAt, text });
  captionTimeline.set(page, events);
}

/**
 * Snapshot for the framing pass. Read after the context has closed is fine: the map is keyed by the Page object itself, which outlives its browser context.
 */
export function getRecordingTimeline(page: Page): RecordingTimeline {
  return {
    startedAt: recordingStartedAt.get(page) ?? Date.now(),
    events: captionTimeline.get(page) ?? [],
  };
}
