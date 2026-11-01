import { createScenePainter, type CaptureOptions } from "@/components/playback/scene-painter";
import { loadGoogleFont } from "@/lib/fonts/load-google-font";
import type { PoolElement } from "@/lib/playback/media-pool";
import { buildScene } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { activeClipsAt } from "@/lib/timeline/active-clips";
import type { Clip, TimelineProject } from "@/types/timeline";

const LOAD_TIMEOUT_MS = 20_000;
const SEEK_TIMEOUT_MS = 10_000;

export interface FrameRenderer {
  /** Loads the fonts and pictures the project uses. Call once, before the first frame. */
  prepare(): Promise<void>;
  /** Puts the project, as it looks at `time`, into the painter: waits for videos to reach their frame. */
  renderAt(time: number): Promise<void>;
  capture(options: CaptureOptions): string;
  dispose(): void;
}

function once(target: EventTarget, events: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = (name: string) => () => {
      cleanup();
      resolve(name);
    };
    const handlers = events.map((name) => [name, done(name)] as const);
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("A file took too long to load."));
    }, timeoutMs);
    function cleanup() {
      window.clearTimeout(timer);
      for (const [name, handler] of handlers) target.removeEventListener(name, handler);
    }
    for (const [name, handler] of handlers) target.addEventListener(name, handler, { once: true });
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A picture could not be loaded."));
    image.src = url;
  });
}

/**
 * Draws a project frame by frame, off screen, with the same painter the stage
 * uses. Videos are seeked to each frame's exact source time (not played), so
 * an export is frame-accurate however slowly it renders.
 */
export function createFrameRenderer(options: {
  project: TimelineProject;
  frame: FrameSize;
  urlFor(mediaId: string): string | null;
  /** The page colour behind the picture; null for a transparent page. */
  background: string | null;
}): FrameRenderer {
  const { project, frame, urlFor, background } = options;
  const container = document.createElement("div");
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  const painter = createScenePainter({
    container,
    frame,
    getImage: (mediaId) => images.get(mediaId) ?? null,
    background,
  });

  async function videoFor(clip: Clip): Promise<HTMLVideoElement> {
    const existing = videos.get(clip.id);
    if (existing) return existing;
    const url = urlFor(clip.mediaId);
    if (!url) throw new Error(`The video "${clip.name}" is not available.`);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = url;
    videos.set(clip.id, video);
    const outcome = await once(video, ["loadeddata", "error"], LOAD_TIMEOUT_MS);
    if (outcome === "error") throw new Error(`The video "${clip.name}" could not be loaded.`);
    return video;
  }

  async function seek(video: HTMLVideoElement, time: number) {
    const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.001));
    if (Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2) return;
    const arrived = once(video, ["seeked", "error"], SEEK_TIMEOUT_MS);
    video.currentTime = target;
    if ((await arrived) === "error") throw new Error("A video could not be read at that point.");
  }

  return {
    async prepare() {
      const families = new Set<string>();
      const pictures = new Set<string>();
      for (const clip of project.clips) {
        if (clip.kind === "text" && clip.adjustments.text) families.add(clip.adjustments.text.fontFamily);
        if ((clip.kind === "image" || clip.kind === "sticker") && clip.mediaId) pictures.add(clip.mediaId);
      }
      await Promise.all(Array.from(families, (family) => loadGoogleFont(family)));
      await Promise.all(
        Array.from(pictures, async (mediaId) => {
          const url = urlFor(mediaId);
          if (!url) return;
          images.set(mediaId, await loadImage(url));
        }),
      );
      await document.fonts?.ready;
    },

    async renderAt(time) {
      for (const active of activeClipsAt(project, time)) {
        if (!active.visible || active.clip.kind !== "video") continue;
        const video = await videoFor(active.clip);
        await seek(video, active.sourceTime);
      }
      painter.render(buildScene(project, time, (clipId) => videos.get(clipId) as unknown as PoolElement | undefined));
    },

    capture: (captureOptions) => painter.capture(captureOptions),

    dispose() {
      painter.destroy();
      for (const video of videos.values()) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      videos.clear();
      images.clear();
    },
  };
}
