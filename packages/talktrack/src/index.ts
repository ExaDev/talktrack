// talktrack: narrated, cursor-driven demo recordings from Playwright.
//
// Two ways to drive it, one engine:
//  - inside @playwright/test specs: installCursor(page) at the top, use moveAndClick/fillVisibly/narrateScene instead of raw clicks/fills, and finalizeFramedRecording(page, testInfo) in afterEach;
//  - from a standalone script: const demo = await recordDemo("name", { viewport, url }); ...helpers...; await demo.finish();
//
// Both produce the same output: the application window exactly as recorded, a header band above it, and a narration band below it where each caption appears only for the span it was actually shown. Requires the external ffmpeg and ffprobe binaries (see the README).

export {
  beat,
  fillVisibly,
  gotoWithCursor,
  hideCaption,
  humanBeatMs,
  installCursor,
  moveAndClick,
  narrateScene,
  naturalScrollIntoView,
  reloadWithCursor,
  showCaption,
} from "./cursor";
export { defaultBandStyle } from "./bands";
export type { BandStyle } from "./bands";
export { buildFramePlan, captionWindows } from "./filter-graph";
export type { CaptionWindow, FramePlan } from "./filter-graph";
export { defaultHeaderText, frameRecording } from "./frame";
export type { FrameRecordingInput } from "./frame";
export { finalizeFramedRecording } from "./test-adapter";
export type { FinalizeOptions } from "./test-adapter";
export { recordDemo } from "./standalone";
export type { RecordDemoOptions, TalktrackSession } from "./standalone";
export { markRecordingStart, recordCaptionEvent } from "./timeline";
export type { CaptionEvent, RecordingTimeline } from "./timeline";
