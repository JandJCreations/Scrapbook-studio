/** H.264 and VP9 want even width and height; this trims an odd side by one pixel. */
const EVEN_SIDES = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

export type EncodeFormat = "gif" | "mp4" | "mov" | "webm";

export interface EncodeOptions {
  format: EncodeFormat;
  fps: number;
  targetWidth: number;
  transparent: boolean;
  /** An `audio.wav` has been written next to the numbered frames. */
  hasAudio: boolean;
  outputName: string;
  /** What the numbered frames were saved as; JPEG is far quicker to make and read than PNG. */
  frameExtension?: FrameExtension;
}

export type FrameExtension = "png" | "jpg";

/**
 * Opaque video can take JPEG frames, which the browser encodes many times faster than PNG.
 * GIF keeps PNG for clean palettes, and transparent WebM needs PNG's alpha.
 */
export function frameExtensionFor(format: EncodeFormat, transparent: boolean): FrameExtension {
  if (format === "gif") return "png";
  if (format === "webm" && transparent) return "png";
  return "jpg";
}

/** FFmpeg arguments that turn `frame00000.png` (or `.jpg`)... (and optionally `audio.wav`) into the output file. */
export function buildEncodeArgs({
  format,
  fps,
  targetWidth,
  transparent,
  hasAudio,
  outputName,
  frameExtension = "png",
}: EncodeOptions): string[] {
  const input = ["-framerate", String(fps), "-i", `frame%05d.${frameExtension}`];
  const audioInput = hasAudio ? ["-i", "audio.wav"] : [];

  if (format === "gif") {
    return [
      ...input,
      "-vf",
      `fps=${fps},scale=${targetWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      "-loop",
      "0",
      outputName,
    ];
  }

  if (format === "webm") {
    return [
      ...input,
      ...audioInput,
      "-vf",
      EVEN_SIDES,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      transparent ? "yuva420p" : "yuv420p",
      // The quickest VP9 settings, using every core, at a steady quality.
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-row-mt",
      "1",
      "-b:v",
      "0",
      "-crf",
      "32",
      ...(hasAudio ? ["-c:a", "libopus", "-shortest"] : []),
      outputName,
    ];
  }

  // mp4 and mov have no alpha: always yuv420p.
  return [
    ...input,
    ...audioInput,
    "-vf",
    EVEN_SIDES,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    // A quick preset at a good quality; faststart lets the file play before it has fully loaded.
    "-preset",
    "veryfast",
    "-crf",
    "20",
    ...(hasAudio ? ["-c:a", "aac", "-shortest"] : []),
    "-movflags",
    "+faststart",
    outputName,
  ];
}
