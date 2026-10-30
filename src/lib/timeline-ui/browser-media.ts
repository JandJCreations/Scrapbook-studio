import { decodeAudioFile } from "@/lib/audio/decode-audio";
import { computeWaveformPeaks } from "@/lib/audio/waveform";
import type { FrameExtractor } from "@/lib/timeline-ui/thumbnail-service";

// The only file under src/lib/timeline-ui allowed to call browser APIs. It has
// no unit tests; it is type-checked and exercised in a real browser.

const FRAME_WIDTH = 160;
const JPEG_QUALITY = 0.7;
const SEEK_TIMEOUT_MS = 8000;
const IDLE_CLOSE_MS = 3000;
const WAVEFORM_BUCKETS = 2000;

interface Entry {
  video: HTMLVideoElement;
  ready: Promise<void>;
  idle: number | null;
}

function waitFor(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, SEEK_TIMEOUT_MS);
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not be read"));
    };
    function cleanup() {
      window.clearTimeout(timer);
      video.removeEventListener(event, onDone);
      video.removeEventListener("error", onError);
    }
    video.addEventListener(event, onDone);
    video.addEventListener("error", onError);
  });
}

/**
 * Takes frames from video files with one reused, hidden element per file. The
 * element closes itself a few seconds after its last frame.
 */
export function createVideoFrameExtractor(): FrameExtractor {
  const entries = new Map<string, Entry>();

  function close(url: string) {
    const entry = entries.get(url);
    if (!entry) return;
    if (entry.idle !== null) window.clearTimeout(entry.idle);
    entry.video.removeAttribute("src");
    entry.video.load();
    entries.delete(url);
  }

  function open(url: string): Entry {
    const existing = entries.get(url);
    if (existing) return existing;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // Before src, or drawing a remote file taints the canvas.
    video.crossOrigin = "anonymous";
    const ready = waitFor(video, "loadeddata");
    video.src = url;
    const entry: Entry = { video, ready, idle: null };
    entries.set(url, entry);
    ready.catch(() => close(url));
    return entry;
  }

  return {
    async frame(url, time) {
      const entry = open(url);
      await entry.ready;
      const { video } = entry;
      if (entry.idle !== null) window.clearTimeout(entry.idle);

      const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
      if (Math.abs(video.currentTime - target) > 0.001) {
        const seeked = waitFor(video, "seeked");
        video.currentTime = target;
        await seeked;
      }

      const canvas = document.createElement("canvas");
      canvas.width = FRAME_WIDTH;
      canvas.height = Math.max(1, Math.round((FRAME_WIDTH * video.videoHeight) / video.videoWidth));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2D canvas available");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

      entry.idle = window.setTimeout(() => close(url), IDLE_CLOSE_MS);
      return frame;
    },

    dispose() {
      for (const url of Array.from(entries.keys())) close(url);
    },
  };
}

export async function loadPeaksFromUrl(url: string): Promise<number[]> {
  const buffer = await decodeAudioFile(url);
  return computeWaveformPeaks(buffer, WAVEFORM_BUCKETS);
}
