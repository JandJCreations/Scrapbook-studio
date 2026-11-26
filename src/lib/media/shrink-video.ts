/**
 * Makes a video small enough to save, in the browser, with the computer's own
 * video encoder (WebCodecs, through mediabunny). Phone clips are often well
 * over Storage's per-file limit (50 MB on the free plan, so anything past
 * about 45 seconds of 1080p): instead of refusing them, they are re-encoded at
 * a size and bitrate picked to land under the limit.
 */

/** Room left under the limit for the container and the audio estimate being a little off. */
const HEADROOM = 0.88;
const AUDIO_BITRATE = 128_000;
const MAX_VIDEO_BITRATE = 6_000_000;
/** Below this, the picture would be too blocky to be worth it: ask for a shorter clip instead. */
const MIN_VIDEO_BITRATE = 600_000;

export class ShrinkError extends Error {}

/** The bitrate (bits per second) that fits `seconds` of video in `limitBytes`, or null when it can't fit watchably. */
export function bitrateToFit(seconds: number, limitBytes: number): number | null {
  if (!(seconds > 0)) return null;
  const video = Math.floor((limitBytes * 8 * HEADROOM) / seconds - AUDIO_BITRATE);
  if (video < MIN_VIDEO_BITRATE) return null;
  return Math.min(MAX_VIDEO_BITRATE, video);
}

/** The longest side to scale to for a bitrate: lower bitrates look better at a smaller size. */
export function longSideFor(bitrate: number): number {
  if (bitrate >= 4_000_000) return 1920;
  if (bitrate >= 1_800_000) return 1280;
  return 960;
}

/** Even dimensions no bigger than the original, with the long side at most `longSide`. */
export function fitDimensions(width: number, height: number, longSide: number): { width: number; height: number } {
  const scale = Math.min(1, longSide / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export async function shrinkVideo(
  file: File,
  limitBytes: number,
  onProgress: (fraction: number) => void,
): Promise<File> {
  if (typeof VideoEncoder === "undefined") {
    throw new ShrinkError("This browser can't make videos smaller. Try Chrome, Edge or Safari, or trim the clip first.");
  }
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new ShrinkError("Couldn't read the picture in this video.");
    const seconds = await input.computeDuration();
    const bitrate = bitrateToFit(seconds, limitBytes);
    if (bitrate === null) {
      throw new ShrinkError("This video is too long to save. Trim it to a few minutes and try again.");
    }
    // Encoders don't always hit the bitrate they're given (grainy or busy footage runs over): one more,
    // lower try when the first comes out too big.
    let target = bitrate;
    for (let attempt = 0; attempt < 2; attempt++) {
      const shrunk = await encode(mb, input, track, target, file.name, onProgress);
      if (shrunk.size <= limitBytes) return shrunk;
      target = Math.floor(target * ((limitBytes * HEADROOM) / shrunk.size));
      if (target < MIN_VIDEO_BITRATE / 2) break;
    }
    throw new ShrinkError("This video is still too big after making it smaller. Trim it and try again.");
  } finally {
    input.dispose?.();
  }
}

type Mediabunny = typeof import("mediabunny");

async function encode(
  mb: Mediabunny,
  input: InstanceType<Mediabunny["Input"]>,
  track: { displayWidth: number; displayHeight: number },
  bitrate: number,
  originalName: string,
  onProgress: (fraction: number) => void,
): Promise<File> {
  const size = fitDimensions(track.displayWidth, track.displayHeight, longSideFor(bitrate));

  let videoCodec: "avc" | "vp9" | "av1" | null = null;
  for (const codec of ["avc", "vp9", "av1"] as const) {
    if (await mb.canEncodeVideo(codec, { ...size, bitrate })) {
      videoCodec = codec;
      break;
    }
  }
  if (!videoCodec) throw new ShrinkError("This browser can't make videos smaller. Trim the clip first, or try Chrome.");
  const audioCodec = (await mb.canEncodeAudio("aac")) ? "aac" : "opus";

  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new mb.BufferTarget(),
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { ...size, fit: "contain", codec: videoCodec, bitrate, forceTranscode: true },
    audio: { codec: audioCodec, bitrate: AUDIO_BITRATE },
    showWarnings: false,
  });
  if (!conversion.isValid) throw new ShrinkError("Couldn't make this video smaller. Trim it and try again.");
  conversion.onProgress = (progress) => onProgress(progress);
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) throw new ShrinkError("Couldn't make this video smaller. Try again.");
  return new File([buffer], originalName.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4" });
}
