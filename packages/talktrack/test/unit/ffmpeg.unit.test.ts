import { describe, expect, it } from "vitest";
import { assertVideoMatchesViewport } from "../../src/ffmpeg";

describe("assertVideoMatchesViewport", () => {
  const viewport = { width: 1280, height: 720 } as const;
  const videoPath = "recording.webm";

  it("accepts a recording the same size as the viewport", () => {
    expect(() => {
      assertVideoMatchesViewport(
        { durationMs: 1, ...viewport },
        viewport,
        videoPath,
      );
    }).not.toThrow();
  });

  it("rejects a scaled-down recording and names both sizes", () => {
    // Playwright's default recording size for a viewport this large: scaled to fit inside 800x800 with the aspect ratio kept.
    const scaled = { durationMs: 1, width: 800, height: 450 };
    expect(() => {
      assertVideoMatchesViewport(scaled, viewport, videoPath);
    }).toThrow(/800x450.*1280x720/);
  });

  it("rejects a mismatch in either dimension alone", () => {
    expect(() => {
      assertVideoMatchesViewport(
        { durationMs: 1, width: viewport.width, height: viewport.height + 1 },
        viewport,
        videoPath,
      );
    }).toThrow();
    expect(() => {
      assertVideoMatchesViewport(
        { durationMs: 1, width: viewport.width + 1, height: viewport.height },
        viewport,
        videoPath,
      );
    }).toThrow();
  });
});
