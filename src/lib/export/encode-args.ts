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
}

/** FFmpeg arguments that turn `frame00000.png`... (and optionally `audio.wav`) into the output file. */
export function buildEncodeArgs({
  format,
  fps,
  targetWidth,
  transparent,
  hasAudio,
  outputName,
}: EncodeOptions): string[] {
  const input = ["-framerate", String(fps), "-i", "frame%05d.png"];
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
    ...(hasAudio ? ["-c:a", "aac", "-shortest"] : []),
    outputName,
  ];
}
