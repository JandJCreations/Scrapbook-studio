import { decodeAudioFile } from "@/lib/audio/decode-audio";
import { computeWaveformPeaks } from "@/lib/audio/waveform";
import { createFrameExtractor, type VideoLike } from "@/lib/timeline-ui/frame-extractor";
import type { FrameExtractor } from "@/lib/timeline-ui/thumbnail-service";
import { peakBucketCount } from "@/lib/timeline-ui/visuals";

// The only file under src/lib/timeline-ui allowed to call browser APIs. It has
// no unit tests; it is type-checked and exercised in a real browser. All the
// logic around it (open-element limits, closing on failure, timeouts) lives in
// frame-extractor.ts, where it is tested.

const FRAME_WIDTH = 160;
const JPEG_QUALITY = 0.7;

function drawFrame(video: VideoLike): string {
  const source = video as HTMLVideoElement;
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH;
  canvas.height = Math.max(1, Math.round((FRAME_WIDTH * source.videoHeight) / source.videoWidth));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas available");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function createVideoFrameExtractor(): FrameExtractor {
  return createFrameExtractor({
    createVideo: () => document.createElement("video"),
    drawFrame,
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (id) => window.clearTimeout(id),
  });
}

export async function loadPeaksFromUrl(url: string): Promise<number[]> {
  const buffer = await decodeAudioFile(url);
  return computeWaveformPeaks(buffer, peakBucketCount(buffer.duration));
}
