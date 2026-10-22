export interface SampleClipSpec {
  name: string;
  /** Seconds. */
  duration: number;
  size: { width: number; height: number };
  fps: number;
  toneHz: number;
  /** Invert the colours so a cut between two samples is easy to see. */
  negate: boolean;
}

export const SAMPLE_CLIPS: SampleClipSpec[] = [
  { name: "Sample A", duration: 6, size: { width: 640, height: 360 }, fps: 30, toneHz: 440, negate: false },
  { name: "Sample B", duration: 6, size: { width: 640, height: 360 }, fps: 30, toneHz: 660, negate: true },
];

/**
 * FFmpeg arguments for a clip whose picture is the `testsrc` pattern (it burns
 * a running timecode into every frame, so a screenshot shows which source frame
 * is on screen) with a sine tone.
 */
export function buildSampleArgs(spec: SampleClipSpec, outputName: string): string[] {
  const { width, height } = spec.size;
  return [
    "-f",
    "lavfi",
    "-i",
    `testsrc=duration=${spec.duration}:size=${width}x${height}:rate=${spec.fps}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${spec.toneHz}:duration=${spec.duration}`,
    ...(spec.negate ? ["-vf", "negate"] : []),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outputName,
  ];
}

/** The part of the FFmpeg WASM API used here; the real class satisfies it. */
export interface FfmpegLike {
  exec(args: string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
}

export async function generateSampleClip(ffmpeg: FfmpegLike, spec: SampleClipSpec): Promise<Blob> {
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const output = `${slug}.mp4`;
  try {
    const exitCode = await ffmpeg.exec(buildSampleArgs(spec, output));
    if (exitCode !== 0) {
      throw new Error(
        `FFmpeg could not generate "${spec.name}" (exit code ${exitCode}). This FFmpeg build may not support the test pattern; add your own files instead.`,
      );
    }
    const data = await ffmpeg.readFile(output);
    if (typeof data === "string") {
      throw new Error(`FFmpeg returned no video data for "${spec.name}".`);
    }
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}
