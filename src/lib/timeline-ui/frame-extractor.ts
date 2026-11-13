import type { FrameExtractor } from "@/lib/timeline-ui/thumbnail-service";

/** The part of a video element the extractor uses; a real HTMLVideoElement fits. */
export interface VideoLike {
  muted: boolean;
  playsInline: boolean;
  preload: string;
  crossOrigin: string | null;
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  removeAttribute(name: string): void;
  load(): void;
}

export interface FrameExtractorDeps {
  createVideo(): VideoLike;
  /** Draws the video's current frame and returns it as an image URL. */
  drawFrame(video: VideoLike): string;
  setTimer(callback: () => void, ms: number): number;
  clearTimer(id: number): void;
  /** How many video elements may be open at once (default 3). */
  maxOpen?: number;
}

const WAIT_TIMEOUT_MS = 8000;
const IDLE_CLOSE_MS = 3000;
const DEFAULT_MAX_OPEN = 3;
const END_MARGIN_SECONDS = 0.05;

interface Entry {
  video: VideoLike;
  ready: Promise<void>;
  idle: number | null;
}

/**
 * Takes frames from video files with one reused, hidden element per file. An
 * element closes a few seconds after its last frame, at once when anything
 * goes wrong with it, and the least recently used one closes first when too
 * many are open.
 */
export function createFrameExtractor(deps: FrameExtractorDeps): FrameExtractor {
  const maxOpen = deps.maxOpen ?? DEFAULT_MAX_OPEN;
  const entries = new Map<string, Entry>(); // insertion order = least recently used first

  function waitFor(video: VideoLike, event: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = deps.setTimer(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${event}`));
      }, WAIT_TIMEOUT_MS);
      const onDone = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("The video could not be read"));
      };
      function cleanup() {
        deps.clearTimer(timer);
        video.removeEventListener(event, onDone);
        video.removeEventListener("error", onError);
      }
      video.addEventListener(event, onDone);
      video.addEventListener("error", onError);
    });
  }

  function close(url: string) {
    const entry = entries.get(url);
    if (!entry) return;
    entries.delete(url);
    if (entry.idle !== null) deps.clearTimer(entry.idle);
    entry.video.removeAttribute("src");
    entry.video.load();
  }

  function open(url: string): Entry {
    const existing = entries.get(url);
    if (existing) {
      entries.delete(url); // touch: now the most recently used
      entries.set(url, existing);
      return existing;
    }
    while (entries.size >= maxOpen) close(entries.keys().next().value as string);

    const video = deps.createVideo();
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // Before src, or drawing a remote file taints the canvas.
    video.crossOrigin = "anonymous";
    const ready = waitFor(video, "loadeddata");
    video.src = url;
    const entry: Entry = { video, ready, idle: null };
    entries.set(url, entry);
    // If it never loads, nobody is going to ask it for a frame again.
    ready.catch(() => close(url));
    return entry;
  }

  return {
    async frame(url, time) {
      const entry = open(url);
      try {
        await entry.ready;
        const { video } = entry;
        if (entry.idle !== null) {
          deps.clearTimer(entry.idle);
          entry.idle = null;
        }

        const target = Math.max(0, Math.min(time, Math.max(0, video.duration - END_MARGIN_SECONDS)));
        if (Math.abs(video.currentTime - target) > 0.001) {
          const seeked = waitFor(video, "seeked");
          video.currentTime = target;
          await seeked;
        }
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          throw new Error("That file has no picture to take a frame from");
        }
        const frame = deps.drawFrame(video);
        entry.idle = deps.setTimer(() => close(url), IDLE_CLOSE_MS);
        return frame;
      } catch (error) {
        close(url); // never leave a failed element open
        throw error;
      }
    },

    dispose() {
      for (const url of Array.from(entries.keys())) close(url);
    },
  };
}
