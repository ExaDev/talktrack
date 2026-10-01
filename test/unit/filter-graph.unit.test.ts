import { describe, expect, it } from "vitest";
import { defaultBandStyle } from "../../src/bands";
import { buildFramePlan, captionWindows } from "../../src/filter-graph";
import type { CaptionEvent } from "../../src/timeline";

describe("captionWindows", () => {
  // One duration for every test: the interesting boundaries are the event timestamps, not the total length.
  const VIDEO_DURATION_MS = 5000;

  it("closes each show at the next event and the last show at the video's end", () => {
    const events: CaptionEvent[] = [
      { atMs: 0, text: "first" },
      { atMs: 1000, text: null },
      { atMs: 2000, text: "second" },
      { atMs: 3000, text: "third" },
    ];

    expect(captionWindows(events, VIDEO_DURATION_MS)).toEqual([
      { text: "first", startMs: 0, endMs: 1000 },
      { text: "second", startMs: 2000, endMs: 3000 },
      { text: "third", startMs: 3000, endMs: VIDEO_DURATION_MS },
    ]);
  });

  it("a later show replaces the line without an intervening hide", () => {
    const events: CaptionEvent[] = [
      { atMs: 500, text: "a" },
      { atMs: 900, text: "b" },
    ];

    expect(captionWindows(events, VIDEO_DURATION_MS)).toEqual([
      { text: "a", startMs: 500, endMs: 900 },
      { text: "b", startMs: 900, endMs: VIDEO_DURATION_MS },
    ]);
  });

  it("an empty timeline opens no windows", () => {
    expect(captionWindows([], VIDEO_DURATION_MS)).toEqual([]);
  });

  it("a hide with nothing showing opens no window", () => {
    const events: CaptionEvent[] = [{ atMs: 700, text: null }];
    expect(captionWindows(events, VIDEO_DURATION_MS)).toEqual([]);
  });
});

describe("buildFramePlan", () => {
  const viewport = { width: 1280, height: 720 } as const;

  it("pads to viewport plus both bands and overlays the header at the top", () => {
    const plan = buildFramePlan(viewport, defaultBandStyle, []);
    expect(plan.inputCount).toBe(2);
    expect(plan.finalLabel).toBe("v0");
    expect(plan.filterGraph).toBe(
      `[0:v]pad=1280:864:0:48:color=${defaultBandStyle.background}[bg];[bg][1:v]overlay=0:0[v0]`,
    );
  });

  it("chains one time-gated overlay per window onto the footer region", () => {
    const windows = [
      { text: "hello", startMs: 0, endMs: 1500 },
      { text: "bye", startMs: 2000, endMs: 4000 },
    ];
    const plan = buildFramePlan(viewport, defaultBandStyle, windows);
    // The raw recording and the header band are always the first two inputs; each window adds one caption band.
    const FIXED_INPUT_COUNT = 2;
    expect(plan.inputCount).toBe(FIXED_INPUT_COUNT + windows.length);
    expect(plan.filterGraph).toContain(
      `;[v0][2:v]overlay=0:768:enable='between(t,0.000,1.500)'[v1]`,
    );
    expect(plan.filterGraph).toContain(
      `;[v1][3:v]overlay=0:768:enable='between(t,2.000,4.000)'[v2]`,
    );
    expect(plan.finalLabel).toBe("v2");
  });

  it("honours band style overrides in the pad height and colour", () => {
    const plan = buildFramePlan(
      viewport,
      {
        ...defaultBandStyle,
        headerHeightPx: 60,
        footerHeightPx: 100,
        background: "#000000",
      },
      [],
    );
    expect(plan.filterGraph).toContain("pad=1280:880:0:60:color=#000000");
  });
});
