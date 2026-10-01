// The pure geometry behind the cursor's motion, split out from cursor.ts so it is unit-testable with no browser involved: a human moving a mouse doesn't teleport in a straight line at constant speed. Motion eases in and out, tends to bow slightly off the direct line, sometimes overshoots a touch on longer moves before settling, and has small continuous noise throughout.

/** A point in viewport pixel coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** The fewest points a glide is ever broken into: a short nudge is never reduced to a single frame. */
export const MIN_PATH_STEPS = 8;

/** The most points a glide is ever broken into: a cross-viewport move shouldn't take forever. */
export const MAX_PATH_STEPS = 34;

/**
 * Uniform noise in -spread..spread, used for micro-jitter along the path.
 */
export function jitter(spread: number): number {
  // Centres Math.random()'s 0..1 output on zero before scaling to -spread..spread.
  const RANDOM_UNIT_CENTER = 0.5;

  return (Math.random() - RANDOM_UNIT_CENTER) * 2 * spread;
}

/**
 * Builds the human-feeling path between two points as a list of intermediate points; the caller paces them out over real wall-clock time so a screen recording actually shows the glide. The last point is always exactly `to`, regardless of jitter or overshoot.
 */
export function buildHumanPath(
  from: Readonly<Point>,
  to: Readonly<Point>,
): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 2) return [to];

  // More steps for longer distances, bounded by MIN_PATH_STEPS and MAX_PATH_STEPS above. Roughly one path point per this many pixels of travel.
  const PATH_STEP_DISTANCE_PX = 14;
  const steps = Math.max(
    MIN_PATH_STEPS,
    Math.min(MAX_PATH_STEPS, Math.round(distance / PATH_STEP_DISTANCE_PX)),
  );
  // Perpendicular unit vector, for the mid-path bow.
  const perpX = -dy / distance;
  const perpY = dx / distance;
  const MAX_BOW_MAGNITUDE_PX = 40;
  // The bow scales with distance, up to the cap above.
  const BOW_MAGNITUDE_RATIO = 0.12;
  // Coin flip: bow left or right of the direct line.
  const BOW_DIRECTION_PROBABILITY = 0.5;
  const bowMagnitude =
    Math.min(MAX_BOW_MAGNITUDE_PX, distance * BOW_MAGNITUDE_RATIO) *
    (Math.random() < BOW_DIRECTION_PROBABILITY ? 1 : -1);
  // Only longer moves are eligible to overshoot.
  const OVERSHOOT_MIN_DISTANCE_PX = 180;
  const OVERSHOOT_PROBABILITY = 0.6;
  const overshoot =
    distance > OVERSHOOT_MIN_DISTANCE_PX &&
    Math.random() < OVERSHOOT_PROBABILITY;
  const OVERSHOOT_MIN_PX = 6;
  const OVERSHOOT_RANDOM_RANGE_PX = 10;
  const overshootPx = overshoot
    ? OVERSHOOT_MIN_PX + Math.random() * OVERSHOOT_RANDOM_RANGE_PX
    : 0;
  // Fraction of the path where the overshoot begins, and where it has fully settled.
  const OVERSHOOT_WINDOW_START_T = 0.8;
  const OVERSHOOT_WINDOW_END_T = 0.97;
  // OVERSHOOT_WINDOW_END_T minus OVERSHOOT_WINDOW_START_T, used to normalise t across the window.
  const OVERSHOOT_WINDOW_WIDTH_T = 0.17;
  const PATH_POINT_JITTER_PX = 0.6;

  const path: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Accelerate away from the start, decelerate into the target; the curve itself is easeInOutCubic below.
    const eased = easeInOutCubic(t);
    // The bow peaks at the path's midpoint and fades to zero at both ends.
    const bow = Math.sin(t * Math.PI) * bowMagnitude;
    let px = from.x + dx * eased + perpX * bow;
    let py = from.y + dy * eased + perpY * bow;
    if (
      overshoot &&
      t > OVERSHOOT_WINDOW_START_T &&
      t < OVERSHOOT_WINDOW_END_T
    ) {
      // 0 -> 1 across the overshoot window.
      const overshootT =
        (t - OVERSHOOT_WINDOW_START_T) / OVERSHOOT_WINDOW_WIDTH_T;
      // Out and back.
      const settle = Math.sin(overshootT * Math.PI);
      px += (dx / distance) * overshootPx * settle;
      py += (dy / distance) * overshootPx * settle;
    }
    path.push({
      x: px + jitter(PATH_POINT_JITTER_PX),
      y: py + jitter(PATH_POINT_JITTER_PX),
    });
  }
  // Land exactly on target regardless of jitter/overshoot.
  path[path.length - 1] = to;

  return path;
}

/**
 * Ease-in-out cubic, shared with naturalScrollIntoView's own identical curve: a real scroll (wheel or trackpad) accelerates away from rest and decelerates into rest, it doesn't move at constant speed.
 */
export function easeInOutCubic(t: number): number {
  // Fraction of progress where the curve switches from accelerating to decelerating.
  const EASE_MIDPOINT_T = 0.5;
  // Scales the accelerating half's t^3 term.
  const EASE_IN_CUBIC_SCALE = 4;
  // Coefficient of t inside the decelerating half's inner expression, and the exponent applied to that inner expression.
  const EASE_OUT_LINEAR_COEFFICIENT = -2;
  const EASE_OUT_CUBIC_EXPONENT = 3;

  return t < EASE_MIDPOINT_T
    ? EASE_IN_CUBIC_SCALE * t * t * t
    : 1 -
        Math.pow(EASE_OUT_LINEAR_COEFFICIENT * t + 2, EASE_OUT_CUBIC_EXPONENT) /
          2;
}
