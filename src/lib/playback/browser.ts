import type { MediaElementKind } from "@/lib/engine/wanted";

// The only module under src/lib/playback allowed to call browser APIs directly.
// It has no unit tests; it is type-checked and exercised in a real browser.

/** Seconds on a monotonic clock. */
export function browserNow(): number {
  return performance.now() / 1000;
}

/** Runs the callback on the next animation frame; returns a canceller. */
export function browserSchedule(callback: () => void): () => void {
  const id = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(id);
}

/** Created suspended until a user gesture resumes it. */
export function createBrowserAudioContext(): AudioContext {
  return new AudioContext();
}

export function createBrowserElement(kind: MediaElementKind): HTMLMediaElement {
  const element = document.createElement(kind);
  if (element instanceof HTMLVideoElement) element.playsInline = true;
  element.preload = "auto";
  // Must be set before any src: without it, cross-origin media is silenced once
  // it is routed through the audio graph.
  element.crossOrigin = "anonymous";
  return element;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
}

/** Reads a file's length and natural size without keeping an element around. */
export function readMediaInfo(url: string, kind: "video" | "audio" | "image"): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    if (kind === "image") {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () =>
        resolve({ duration: 0, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () =>
        reject(new Error("Could not read that image (a remote server may not allow cross-origin use)."));
      image.src = url;
      return;
    }

    const element = document.createElement(kind);
    element.preload = "metadata";
    element.crossOrigin = "anonymous";
    element.onloadedmetadata = () => {
      const duration = element.duration;
      const width = element instanceof HTMLVideoElement ? element.videoWidth : 0;
      const height = element instanceof HTMLVideoElement ? element.videoHeight : 0;
      element.removeAttribute("src");
      element.load();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("That file has no usable length."));
        return;
      }
      resolve({ duration, width, height });
    };
    element.onerror = () =>
      reject(
        new Error("Could not read that media file (a remote server may not allow cross-origin use)."),
      );
    element.src = url;
  });
}
