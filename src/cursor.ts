import { type Locator, type Page } from "@playwright/test";
import { buildHumanPath, easeInOutCubic, type Point } from "./human-path";
import { markRecordingStart, recordCaptionEvent } from "./timeline";

// Playwright drives the DOM directly and never moves a visible pointer, so a screen recording of an automated run shows silent jump-cuts with no indication of what was clicked or how. This installs a synthetic cursor overlay (a dot that tracks real `mousemove` events, animates on click, and persists its position across navigations instead of resetting to the corner), glides the cursor along a slightly curved, eased, jittered path rather than a robotic straight-line teleport, and exposes moveAndClick/fillVisibly/gotoWithCursor/showCaption/hideCaption helpers built on top, so recordings made with them read as a person driving the UI with someone narrating over their shoulder, not a silent script. Narration itself is not an in-page overlay: showCaption/hideCaption below timestamp the narration text against the recording's own start time (see ./timeline), and the actual banner is composited into a dedicated band below the recorded app window during post-processing (see ./frame for why an in-page overlay can't produce that layout on its own).

// TALKTRACK_OVERLAY_INIT runs inside the page (via page.evaluate/addInitScript), so it attaches its handles to the real browser `window` rather than returning them. This augmentation is what lets moveAndClick below call window.__talktrackPress directly, with no `as unknown as` cast.
declare global {
  interface Window {
    __talktrackPress?: (x: number, y: number) => void;
    __talktrackRelease?: () => void;
  }
}

const TALKTRACK_OVERLAY_INIT = () => {
  if (document.getElementById("__talktrack_cursor__")) return;
  const style = document.createElement("style");
  style.textContent = `
    #__talktrack_cursor__ {
      position: fixed; top: 0; left: 0; width: 22px; height: 22px;
      border-radius: 50%; background: rgba(220,38,38,0.88);
      border: 2px solid white; box-shadow: 0 1px 5px rgba(0,0,0,0.6);
      pointer-events: none; z-index: 2147483647; transform: translate(-50%, -50%) scale(1);
      transition: transform 0.12s ease-out, background-color 0.12s ease-out;
    }
    #__talktrack_cursor__.__talktrack_pressed__ {
      transform: translate(-50%, -50%) scale(0.55);
      background: rgba(153,27,27,0.95);
    }
    .__talktrack_ripple__ {
      position: fixed; width: 14px; height: 14px; border-radius: 50%;
      border: 3px solid rgba(220,38,38,0.9); pointer-events: none; z-index: 2147483647;
      transform: translate(-50%, -50%); animation: __talktrack_ripple_anim__ 0.55s ease-out forwards;
    }
    @keyframes __talktrack_ripple_anim__ {
      from { width: 14px; height: 14px; opacity: 1; }
      to { width: 58px; height: 58px; opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  const cursor = document.createElement("div");
  cursor.id = "__talktrack_cursor__";
  document.body.appendChild(cursor);
  window.addEventListener(
    "mousemove",
    (e) => {
      cursor.style.left = `${String(e.clientX)}px`;
      cursor.style.top = `${String(e.clientY)}px`;
    },
    true,
  );
  window.__talktrackPress = (x, y) => {
    cursor.classList.add("__talktrack_pressed__");
    const ripple = document.createElement("div");
    ripple.className = "__talktrack_ripple__";
    ripple.style.left = `${String(x)}px`;
    ripple.style.top = `${String(y)}px`;
    document.body.appendChild(ripple);
    const RIPPLE_REMOVE_DELAY_MS = 600;
    setTimeout(() => {
      ripple.remove();
    }, RIPPLE_REMOVE_DELAY_MS);
  };
  window.__talktrackRelease = () => {
    cursor.classList.remove("__talktrack_pressed__");
  };
};

// Per-page last-known cursor position, so a navigation can restore it on the fresh document instead of the overlay resetting to the top-left corner, and so the next glide starts from where the cursor actually is rather than an arbitrary origin.
const currentPosition = new WeakMap<Page, Point>();

async function glideTo(page: Page, to: Readonly<Point>): Promise<void> {
  const from = currentPosition.get(page) ?? { x: to.x, y: to.y };
  const path = buildHumanPath(from, to);
  const MOVE_STEP_MIN_DELAY_MS = 12;
  const MOVE_STEP_DELAY_RANGE_MS = 10;
  for (const point of path) {
    await page.mouse.move(point.x, point.y);
    // ~12-22ms per step: roughly natural mouse-sampling pace, with enough jitter that consecutive glides don't all take an identical, obviously-scripted duration.
    await page.waitForTimeout(
      MOVE_STEP_MIN_DELAY_MS + Math.random() * MOVE_STEP_DELAY_RANGE_MS,
    );
  }
  currentPosition.set(page, to);
}

// page.evaluate right after a navigation races the document it targets (a redirect or a late client transition can swap the page out from under it), which throws "Execution context was destroyed". That's expected, not a real failure of this cosmetic helper, so it's tolerated here rather than aborting the whole recording over it.
async function tolerateNavigationRace<T>(
  promise: Readonly<Promise<T>>,
): Promise<T | undefined> {
  return promise.catch(() => undefined);
}

/**
 * Playwright's own locator.scrollIntoViewIfNeeded() is a synchronous DOM scrollIntoView: an instant jump-cut in a recording, not something a person watching would recognise as scrolling at all. This drives a real sequence of wheel events instead, eased and paced like glideTo's own mouse path, so a recording shows the page actually gliding to the target rather than teleporting to it. Exported (not just used internally by moveAndClick below) so a demo can bring a target into view on its own, with no click attached (for example before narrating over a tall diagram whose own heading satisfies a "content rendered" assertion long before the diagram's body, the actual thing being narrated, has scrolled into the visible viewport).
 */
export async function naturalScrollIntoView(
  page: Page,
  locator: Readonly<Locator>,
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  // Real wheel events hit-test against whatever scrollable element is under the CURRENT mouse position, not the target: moving the mouse toward the viewport's own centre first (rather than wherever the previous click left it) makes that hit-test land on the main scrollable content area rather than, say, a fixed sidebar nav the cursor happens to still be resting over.
  const hoverPoint = { x: viewport.width / 2, y: viewport.height / 2 };
  await tolerateNavigationRace(page.mouse.move(hoverPoint.x, hoverPoint.y));

  const box = await tolerateNavigationRace(locator.boundingBox());
  // Let the caller's own click flow surface a clear "no bounding box" error instead of failing silently here.
  if (!box) return;

  // A comfortable margin from the viewport edge, not the literal edge: a person scrolls until they can see the thing clearly, not until it's pixel-perfect at the boundary.
  const margin = 96;
  // Already comfortably in view: nothing to scroll.
  if (box.y >= margin && box.y + box.height <= viewport.height - margin) return;

  // Scroll enough to land the target roughly centred, not pinned to the very top, matching how a person actually scrolls toward something they want to interact with next.
  const totalDelta = box.y + box.height / 2 - viewport.height / 2;
  const MIN_SCROLL_DELTA_PX = 12;
  if (Math.abs(totalDelta) < MIN_SCROLL_DELTA_PX) return;

  const MIN_SCROLL_STEPS = 7;
  const MAX_SCROLL_STEPS = 26;
  const PIXELS_PER_SCROLL_STEP = 55;
  const steps = Math.max(
    MIN_SCROLL_STEPS,
    Math.min(
      MAX_SCROLL_STEPS,
      Math.round(Math.abs(totalDelta) / PIXELS_PER_SCROLL_STEP),
    ),
  );
  let deliveredSoFar = 0;
  const SCROLL_STEP_MIN_DELAY_MS = 14;
  const SCROLL_STEP_DELAY_RANGE_MS = 12;
  for (let i = 1; i <= steps; i++) {
    const eased = easeInOutCubic(i / steps);
    const target = totalDelta * eased;
    const stepDelta = target - deliveredSoFar;
    deliveredSoFar = target;
    await page.mouse.wheel(0, stepDelta);
    // ~14-26ms per step: a real scroll-wheel/trackpad delivers a burst of small deltas at roughly this cadence, with jitter so consecutive scrolls in the same recording don't all take an identical, obviously-scripted duration.
    await page.waitForTimeout(
      SCROLL_STEP_MIN_DELAY_MS + Math.random() * SCROLL_STEP_DELAY_RANGE_MS,
    );
  }
  // A brief settle beat after the scroll stops, the way a person pauses a moment before their next action rather than clicking mid-scroll.
  const SCROLL_SETTLE_MIN_DELAY_MS = 140;
  const SCROLL_SETTLE_DELAY_RANGE_MS = 120;
  await page.waitForTimeout(
    SCROLL_SETTLE_MIN_DELAY_MS + Math.random() * SCROLL_SETTLE_DELAY_RANGE_MS,
  );
}

async function applyCursor(page: Page): Promise<void> {
  await tolerateNavigationRace(page.evaluate(TALKTRACK_OVERLAY_INIT));
  const pos = currentPosition.get(page);
  if (!pos) return;
  await tolerateNavigationRace(
    page.evaluate(
      ([x, y]) => {
        const cursor = document.getElementById("__talktrack_cursor__");
        if (cursor) {
          cursor.style.left = `${String(x)}px`;
          cursor.style.top = `${String(y)}px`;
        }
      },
      [pos.x, pos.y] as const,
    ),
  );
  // Keeps Playwright's own virtual mouse position in sync with the overlay: otherwise the next glide would start from (0,0), not from where the cursor visually is.
  await tolerateNavigationRace(page.mouse.move(pos.x, pos.y, { steps: 1 }));
}

/**
 * Re-injects on every navigation (addInitScript) and once immediately for the current document, since addInitScript only applies to documents created after it's registered. Also marks the recording's own t0 (see ./timeline): every demo calls this as its very first action, which is the closest available proxy for "when the video recording actually began" without needing frame-exact precision a demo narration track doesn't need anyway.
 */
export async function installCursor(page: Page): Promise<void> {
  markRecordingStart(page);
  await page.addInitScript(TALKTRACK_OVERLAY_INIT);
  await applyCursor(page);
}

/**
 * Use in place of page.goto() for any navigation after installCursor(): restores the cursor to its last known state on the new document instead of letting it reset, so navigating doesn't read as a visual glitch in the recording.
 */
export async function gotoWithCursor(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await applyCursor(page);
}

/**
 * Use in place of page.reload() for any navigation after installCursor(): restores the cursor to its last known state on the new document the same way gotoWithCursor does for page.goto(). A bare page.reload() in a demo that has already called installCursor() is the one navigation path the overlay can't cover on its own: addInitScript recreates the cursor DOM element on the fresh document (so it doesn't vanish outright), but nothing repositions it, so a reload leaves the cursor visibly pinned to the corner until the next moveAndClick's glide happens to move it (confirmed live as the cause of a cursor going missing mid-recording during a demo's own periodic safety-net reloads).
 */
export async function reloadWithCursor(page: Page): Promise<void> {
  await page.reload();
  await applyCursor(page);
}

/**
 * Sets (or updates) the narration shown in the footer band below the recorded app window; see ./timeline for how this timestamped event actually becomes an on-screen banner during post-processing. Pass null (or call hideCaption) to clear it between unrelated steps rather than leaving a stale caption shown throughout the gap.
 */
export function showCaption(page: Page, text: string): void {
  recordCaptionEvent(page, text);
}

/**
 * Clears the narration band (closes the window the last showCaption opened). Hide between unrelated steps rather than leaving a stale caption shown throughout the gap.
 */
export function hideCaption(page: Page): void {
  recordCaptionEvent(page, null);
}

// +/- ~25% jitter around a base duration, so repeated pauses in a recording don't all read as the exact same, obviously-scripted length.
function humanPause(baseMs: number): number {
  const PAUSE_JITTER_MIN_MULTIPLIER = 0.75;
  const PAUSE_JITTER_RANGE_MULTIPLIER = 0.5;

  return Math.round(
    baseMs *
      (PAUSE_JITTER_MIN_MULTIPLIER +
        Math.random() * PAUSE_JITTER_RANGE_MULTIPLIER),
  );
}

/**
 * Moves the cursor humanly to the locator (scrolling it into view first), clicks it, and holds a jittered pause afterwards. Use in place of locator.click() in any recording.
 */
export async function moveAndClick(
  page: Page,
  locator: Readonly<Locator>,
  pauseMs = 250,
): Promise<void> {
  await naturalScrollIntoView(page, locator);
  const box = await locator.boundingBox();
  if (!box)
    throw new Error("Could not resolve a bounding box for the click target");
  // Aim slightly off dead-centre, the way a person rarely clicks a target's exact geometric middle, while staying comfortably inside the element's own bounds.
  const CLICK_TARGET_MIN_OFFSET_RATIO = 0.4;
  const CLICK_TARGET_OFFSET_RANGE_RATIO = 0.2;
  const target = {
    x:
      box.x +
      box.width *
        (CLICK_TARGET_MIN_OFFSET_RATIO +
          Math.random() * CLICK_TARGET_OFFSET_RANGE_RATIO),
    y:
      box.y +
      box.height *
        (CLICK_TARGET_MIN_OFFSET_RATIO +
          Math.random() * CLICK_TARGET_OFFSET_RANGE_RATIO),
  };
  await glideTo(page, target);
  const HOVER_BEFORE_CLICK_MS = 180;
  // A brief hover before committing to the click.
  await page.waitForTimeout(humanPause(HOVER_BEFORE_CLICK_MS));
  await tolerateNavigationRace(
    page.evaluate(([px, py]) => window.__talktrackPress?.(px, py), [
      target.x,
      target.y,
    ] as const),
  );
  // The actual click goes through locator.click(), not raw page.mouse.down()/up() at the coordinates captured above. Those coordinates are a snapshot from before the glide animation and hover pause, which together take several hundred milliseconds; long enough for an async-populated dropdown (options that load after mount) to re-render and shift the option out from under a stale coordinate. Raw mouse events have no actionability check the way locator.click() does, so a stale target silently clicks empty space (or the wrong element) instead of failing loudly or retargeting (confirmed live: this silently produced an unselected field with no error anywhere in the run). locator.click() re-resolves the element and waits for it to be stable/attached/visible immediately before dispatching, which is exactly the robustness raw coordinates can't provide; { force: true } is not used, so a genuinely non-actionable target still fails loudly rather than clicking through.
  await locator.click();
  const PAUSE_AFTER_CLICK_MS = 100;
  await page.waitForTimeout(humanPause(PAUSE_AFTER_CLICK_MS));
  await tolerateNavigationRace(
    page.evaluate(() => window.__talktrackRelease?.()),
  );
  // The click itself may have triggered a hard navigation (a plain <a> link, a form submit's redirect): that swaps in a fresh document, and addInitScript's TALKTRACK_OVERLAY_INIT creates a new cursor at its unset default (pinned to the top-left corner) until something restores it. A single check right after mouse.up() isn't reliable, because the click can take a beat to actually start navigating, so that one check can land before the new document even exists, restoring onto the page that's about to be torn down anyway rather than the one that replaces it. Reapplying a few times over the following stretch means whichever check lands after the real swap picks it back up almost immediately, instead of leaving it missing until some later action reveals it. For a soft navigation or no navigation at all, every extra check is a harmless no-op: the cursor already exists at the right position.
  const CURSOR_REAPPLY_ATTEMPTS = 4;
  const CURSOR_REAPPLY_INTERVAL_MS = 90;
  for (let i = 0; i < CURSOR_REAPPLY_ATTEMPTS; i++) {
    // currentPosition already holds `target`, set by glideTo above.
    await applyCursor(page);
    await page.waitForTimeout(CURSOR_REAPPLY_INTERVAL_MS);
  }
  await page.waitForTimeout(humanPause(pauseMs));
}

// Per-character delay for typeCharByChar, centred around a real, fast-but-plausible typing speed (~45ms/char average is roughly 210 characters/minute, comfortably within normal touch-typing range), with real per-character variance rather than a single fixed delay, plus a slightly longer beat after a space (the natural word-boundary pause) and an occasional, longer "thinking" pause mid-string, the way someone typing a value they're actively composing (a path, a flag list) rather than reciting from memory does.
async function typeCharByChar(page: Page, text: string): Promise<void> {
  const CHAR_TYPE_MIN_DELAY_MS = 28;
  const CHAR_TYPE_DELAY_RANGE_MS = 55;
  const SPACE_PAUSE_MIN_DELAY_MS = 40;
  const SPACE_PAUSE_DELAY_RANGE_MS = 60;
  const THINKING_PAUSE_PROBABILITY = 0.04;
  const THINKING_PAUSE_MIN_DELAY_MS = 200;
  const THINKING_PAUSE_DELAY_RANGE_MS = 400;
  for (const ch of text) {
    await page.keyboard.type(ch);
    let delay =
      CHAR_TYPE_MIN_DELAY_MS + Math.random() * CHAR_TYPE_DELAY_RANGE_MS;
    if (ch === " ")
      delay +=
        SPACE_PAUSE_MIN_DELAY_MS + Math.random() * SPACE_PAUSE_DELAY_RANGE_MS;
    // An occasional longer "thinking" pause.
    if (Math.random() < THINKING_PAUSE_PROBABILITY)
      delay +=
        THINKING_PAUSE_MIN_DELAY_MS +
        Math.random() * THINKING_PAUSE_DELAY_RANGE_MS;
    await page.waitForTimeout(delay);
  }
}

/**
 * Clicks into the locator and types the text character by character at human speed, so a recording shows the value appearing as it's typed rather than arriving at once.
 */
export async function fillVisibly(
  page: Page,
  locator: Readonly<Locator>,
  text: string,
  pauseMs = 300,
): Promise<void> {
  const PRE_FILL_CLICK_PAUSE_MS = 150;
  await moveAndClick(page, locator, humanPause(PRE_FILL_CLICK_PAUSE_MS));
  // Clears any existing value in one step: clearing isn't the part worth watching character by character, typing the new value is.
  await locator.fill("");
  await typeCharByChar(page, text);
  await page.waitForTimeout(humanPause(pauseMs));
}

/**
 * Exported so demos can pace their own non-interaction "reading" pauses (for example holding on a state that just changed) with the same jittered, human-feeling timing.
 */
export function humanBeatMs(baseMs: number): number {
  return humanPause(baseMs);
}

/**
 * Waits a jittered pause of roughly `ms` milliseconds on the page, for "reading" beats between interactions.
 */
export async function beat(page: Page, ms = 600): Promise<void> {
  await page.waitForTimeout(humanBeatMs(ms));
}

// Replaces the two shapes a demo would otherwise hand-roll around showCaption/hideCaption: caption-then-fixed-sleep-then-action (the sleep is unrelated to any page state, so the action can start before or long after the caption's own hold ends) and assert-fully-then-caption (no lead-in at all, since the caption only ever appears once its claim is already true). Neither ties a caption's own on-screen duration to genuine page-state readiness.
//
// showCaption fires immediately, so the caption is up before `settle` (whatever assertion, poll, or action already proves the caption's own claim) has resolved: a real lead-in, not a guess. `settle` and a minimum `leadInMs` floor run concurrently, so a `settle` that resolves in under `leadInMs` still gets a caption that's been up for at least that long, and a `settle` that takes minutes (a capacity poll, say) keeps the caption up for the whole genuine wait rather than a short fixed hold that's already elapsed by the time anything real happens. Once `settle` resolves, the caption holds for `dwellMs` (a real "look at this" pause) before hiding: exactly the digest window a fixed-hold constant was always trying to give, just now added on top of true settle time rather than instead of it.
const NARRATE_SCENE_DEFAULT_LEAD_IN_MS = 800;
const NARRATE_SCENE_DEFAULT_DWELL_MS = 1200;
/**
 * Shows a caption, waits for a real page-state condition to settle while the caption stays up, holds a digest dwell, then hides it. The caption's on-screen duration is tied to genuine readiness (the `settle` promise) rather than a fixed sleep: `leadInMs` is a minimum floor running concurrently with `settle`, and `dwellMs` is the "look at this" hold after it resolves.
 */
export async function narrateScene<T>(
  page: Page,
  text: string,
  settle: () => Promise<T>,
  opts?: { leadInMs?: number; dwellMs?: number },
): Promise<T> {
  const leadInMs = opts?.leadInMs ?? NARRATE_SCENE_DEFAULT_LEAD_IN_MS;
  const dwellMs = opts?.dwellMs ?? NARRATE_SCENE_DEFAULT_DWELL_MS;
  showCaption(page, text);
  const [result] = await Promise.all([settle(), beat(page, leadInMs)]);
  await beat(page, dwellMs);
  hideCaption(page);

  return result;
}
