import { execFile } from "node:child_process";

// A hand-written wrapper rather than util.promisify(execFile): execFile's own overloaded callback signature (its non-callback form returns a live ChildProcess, distinct from the callback form promisify actually targets) trips @typescript-eslint/strict-void-return on the promisified result. This sidesteps the overload ambiguity entirely rather than suppressing the lint rule.
async function runCommand(
  command: string,
  args: readonly string[],
  label: string,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      // ExecFileException is a mapped/Omit-derived type over NodeJS.ErrnoException, not a literal `extends Error` class chain: wrapping it as the `cause` of a real Error satisfies the rejection-must-be-an-Error rule and preserves the original message/stack.
      if (error) {
        // ENOENT gets its own message because "spawn ffmpeg ENOENT" names the wrong thing to fix: the missing piece is the documented external binary, not the spawn call.
        const reason =
          error.code === "ENOENT"
            ? `${label} not found on PATH. talktrack drives the external ${label} binary for video post-processing; install it (for example "brew install ffmpeg" or "apt-get install ffmpeg") and retry.`
            : `${label} failed: ${error.message}`;
        reject(new Error(reason, { cause: error }));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Runs the external ffmpeg binary with the given arguments. Rejects with an install hint rather than a bare spawn error when ffmpeg is not on PATH.
 */
export async function runFfmpeg(args: readonly string[]): Promise<string> {
  return await runCommand("ffmpeg", args, "ffmpeg");
}

/** The dimensions and duration ffprobe reports for a video file. */
export interface VideoFacts {
  durationMs: number;
  width: number;
  height: number;
}

/**
 * Throws unless the recorded video's pixel size equals the viewport the bands are laid out against. Playwright records a smaller video than the viewport unless `video.size` is set to match (its default scales the recording to fit inside 800x800), and the framing pass would then pad that smaller picture onto a canvas sized for the full viewport: a silently mis-laid-out result that still looks like a successful run.
 */
export function assertVideoMatchesViewport(
  facts: Readonly<VideoFacts>,
  viewport: Readonly<{ width: number; height: number }>,
  videoPath: string,
): void {
  if (facts.width === viewport.width && facts.height === viewport.height)
    return;
  throw new Error(
    `talktrack cannot frame ${videoPath}: the recording is ${String(facts.width)}x${String(facts.height)} but the viewport is ${String(viewport.width)}x${String(viewport.height)}. Set the recording size to the viewport size (Playwright Test: video: { mode: "on", size }; recordDemo does this itself) so the bands line up with the picture.`,
  );
}

/**
 * Narrows a parsed JSON value to a plain object, per the house unknown-handling rule: never an assertion, always a guard.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Probes a video file with ffprobe for its pixel dimensions and duration in milliseconds. Any output shape other than the documented stream+format JSON object rejects with the path and what was wrong.
 */
export async function probeVideo(videoPath: string): Promise<VideoFacts> {
  const stdout = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      videoPath,
    ],
    "ffprobe",
  );
  // ffprobe -of json prints { streams: [{ width, height }], format: { duration } } with the duration as a decimal-seconds string.
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) {
    throw new Error(
      `Unexpected ffprobe output for ${videoPath}: not a JSON object`,
    );
  }
  const streams = parsed.streams;
  const format = parsed.format;
  if (!Array.isArray(streams) || !isRecord(format)) {
    throw new Error(
      `Unexpected ffprobe output for ${videoPath}: streams is not an array or format is not an object`,
    );
  }
  const firstStream: unknown = streams[0];
  if (!isRecord(firstStream)) {
    throw new Error(
      `Unexpected ffprobe output for ${videoPath}: first stream is not an object`,
    );
  }
  const width = firstStream.width;
  const height = firstStream.height;
  const durationRaw = format.duration;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof durationRaw !== "string"
  ) {
    throw new Error(
      `Unexpected ffprobe output for ${videoPath}: stream width/height or format.duration has the wrong type`,
    );
  }
  const MS_PER_SECOND = 1000;

  return {
    durationMs: Math.round(Number.parseFloat(durationRaw) * MS_PER_SECOND),
    width,
    height,
  };
}
