import { type BrowserContext } from "@playwright/test";

/**
 * Styling of the header and footer bands composited around the recorded app window. The defaults are deliberately unopinionated (a dark neutral band with the system font stack); override any subset through the `bands` option on finalizeFramedRecording/recordDemo to match the application being recorded.
 */
export interface BandStyle {
  headerHeightPx: number;
  footerHeightPx: number;
  background: string;
  textColor: string;
  fontStack: string;
  headerFontSizePx: number;
  footerFontSizePx: number;
}

/** The band look talktrack frames recordings with when no `bands` override is given. */
export const defaultBandStyle: BandStyle = {
  headerHeightPx: 48,
  footerHeightPx: 96,
  background: "#111827",
  textColor: "#f8fafc",
  fontStack:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  headerFontSizePx: 18,
  footerFontSizePx: 20,
};

/**
 * Merges a caller's partial band overrides over {@link defaultBandStyle}; an absent overrides object yields the defaults unchanged.
 */
export function resolveBandStyle(overrides?: Partial<BandStyle>): BandStyle {
  return { ...defaultBandStyle, ...overrides };
}

/**
 * Escapes the five characters HTML treats as markup, so arbitrary narration text can be embedded in the band page's template safely.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Everything one composited band needs: its pixel size, its text, and the font size to render that text at. */
export interface TextBandSpec {
  width: number;
  height: number;
  fontSizePx: number;
  text: string;
}

/**
 * Renders one band as a PNG. Takes a dedicated throwaway BrowserContext, not the demo's own page/context: a context recording video (recordVideo or Playwright Test's video option) records every page opened within it, so rendering the bands through the demo's own context would leave junk video files alongside the real recording. A fresh context with no video option set (off by default) avoids that entirely.
 *
 * Text is rendered as an ordinary PNG screenshot of that throwaway page rather than via ffmpeg's drawtext filter, since drawtext needs libfreetype/libfontconfig support that common ffmpeg builds (a plain Homebrew install, for instance) don't ship. Rendering text via the same browser already driving the recording sidesteps that dependency and gives exact font parity with the recorded application for free.
 */
export async function renderTextBand(
  bandContext: BrowserContext,
  style: Readonly<BandStyle>,
  band: Readonly<TextBandSpec>,
): Promise<Buffer> {
  const bandPage = await bandContext.newPage();
  try {
    await bandPage.setViewportSize({
      width: band.width,
      height: band.height,
    });
    await bandPage.setContent(`<!doctype html>
<html><head><style>
  html, body { margin: 0; width: ${String(band.width)}px; height: ${String(band.height)}px; background: ${style.background}; display: flex; align-items: center; justify-content: center; }
  p { margin: 0; padding: 0 28px; max-width: 100%; box-sizing: border-box; color: ${style.textColor}; font: 500 ${String(band.fontSizePx)}px/1.35 ${style.fontStack}; text-align: center; overflow-wrap: break-word; }
</style></head>
<body><p>${escapeHtml(band.text)}</p></body></html>`);

    return await bandPage.screenshot({ type: "png" });
  } finally {
    await bandPage.close();
  }
}
