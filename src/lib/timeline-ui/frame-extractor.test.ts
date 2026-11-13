import { describe, expect, it } from "vitest";

import {
  createFrameExtractor,
  type FrameExtractorDeps,
  type VideoLike,
} from "@/lib/timeline-ui/frame-extractor";

/** A video element that does what the test tells it to. */
class FakeVideo implements VideoLike {
  muted = false;
  playsInline = false;
  preload = "";
  /** The order in which properties were assigned. */
  assigned: string[] = [];
  duration = 10;
  videoWidth = 640;
  videoHeight = 360;
  removed = false;
  mode: "ok" | "hang" | "fail-load" | "fail-seek" = "ok";

  private cross: string | null = null;
  private source = "";
  private time = 0;
  private listeners = new Map<string, Set<() => void>>();

  get crossOrigin() {
    return this.cross;
  }
  set crossOrigin(value: string | null) {
    this.assigned.push("crossOrigin");
    this.cross = value;
  }
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.assigned.push("src");
    this.source = value;
    if (this.mode === "hang") return;
    queueMicrotask(() => this.emit(this.mode === "fail-load" ? "error" : "loadeddata"));
  }
  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.time = value;
    if (this.mode === "hang") return;
    queueMicrotask(() => this.emit(this.mode === "fail-seek" ? "error" : "seeked"));
  }

  addEventListener(type: string, listener: () => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  listenerCount() {
    return Array.from(this.listeners.values()).reduce((n, set) => n + set.size, 0);
  }
  removeAttribute() {
    this.removed = true;
    this.source = "";
  }
  load() {}
  emit(type: string) {
    for (const listener of Array.from(this.listeners.get(type) ?? [])) listener();
  }
}

function setup(options: { maxOpen?: number; drawFails?: boolean } = {}) {
  const videos: FakeVideo[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const state: { nextMode: FakeVideo["mode"] } = { nextMode: "ok" };
  let nextTimer = 1;
  const deps: FrameExtractorDeps = {
    createVideo: () => {
      const video = new FakeVideo();
      video.mode = state.nextMode;
      state.nextMode = "ok";
      videos.push(video);
      return video;
    },
    drawFrame: (video) => {
      if (options.drawFails) throw new Error("canvas failed");
      return `frame:${(video as FakeVideo).currentTime}`;
    },
    setTimer: (fn, ms) => {
      timers.set(nextTimer, { fn, ms });
      return nextTimer++;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    maxOpen: options.maxOpen,
  };
  const extractor = createFrameExtractor(deps);
  /** Runs the pending timer with this delay, as if that much time had passed. */
  const fire = (ms: number) => {
    const entry = Array.from(timers.entries()).find(([, t]) => t.ms === ms);
    if (!entry) throw new Error(`no timer of ${ms} ms`);
    timers.delete(entry[0]);
    entry[1].fn();
  };
  return { extractor, videos, timers, fire, state };
}

const IDLE_MS = 3000;
const TIMEOUT_MS = 8000;

describe("createFrameExtractor", () => {
  it("sets crossOrigin before src and reuses one element per file", async () => {
    const { extractor, videos } = setup();
    await extractor.frame("blob:a", 1);
    await extractor.frame("blob:a", 2);
    expect(videos).toHaveLength(1);
    expect(videos[0].assigned).toEqual(["crossOrigin", "src"]);
    expect(videos[0].crossOrigin).toBe("anonymous");
    expect(videos[0].src).toBe("blob:a");
  });

  it("returns the drawn frame at the requested time, clamped inside the file", async () => {
    const { extractor } = setup();
    expect(await extractor.frame("blob:a", 4)).toBe("frame:4");
    expect(await extractor.frame("blob:a", 99)).toBe("frame:9.95");
    expect(await extractor.frame("blob:a", -3)).toBe("frame:0");
  });

  it("closes an element a few seconds after its last frame", async () => {
    const { extractor, videos, timers, fire } = setup();
    await extractor.frame("blob:a", 1);
    expect(timers.size).toBe(1);
    fire(IDLE_MS);
    expect(videos[0].removed).toBe(true);
    await extractor.frame("blob:a", 2); // opens a fresh one
    expect(videos).toHaveLength(2);
  });

  it("closes the element at once when a seek fails, leaving no timer behind", async () => {
    const { extractor, videos, timers } = setup();
    await extractor.frame("blob:a", 1); // opens fine
    videos[0].mode = "fail-seek";
    await expect(extractor.frame("blob:a", 5)).rejects.toThrow();
    expect(videos[0].removed).toBe(true);
    expect(timers.size).toBe(0);
    expect(videos[0].listenerCount()).toBe(0);
  });

  it("closes the element when the file cannot be loaded", async () => {
    const { extractor, videos, timers, state } = setup();
    state.nextMode = "fail-load";
    await expect(extractor.frame("blob:bad", 1)).rejects.toThrow();
    expect(videos[0].removed).toBe(true);
    expect(timers.size).toBe(0);
    expect(videos[0].listenerCount()).toBe(0);
  });

  it("closes the element when drawing the frame fails", async () => {
    const { extractor, videos, timers } = setup({ drawFails: true });
    await expect(extractor.frame("blob:a", 1)).rejects.toThrow("canvas failed");
    expect(videos[0].removed).toBe(true);
    expect(timers.size).toBe(0);
  });

  it("rejects a video with no picture (for example an audio file) instead of caching a blank", async () => {
    const { extractor, videos } = setup();
    await extractor.frame("blob:a", 1);
    videos[0].videoWidth = 0;
    await expect(extractor.frame("blob:a", 2)).rejects.toThrow();
    expect(videos[0].removed).toBe(true);
  });

  it("gives up on a stalled seek after the timeout and closes the element", async () => {
    const { extractor, videos, fire } = setup();
    await extractor.frame("blob:a", 1);
    videos[0].mode = "hang";
    const pending = extractor.frame("blob:a", 5);
    await Promise.resolve();
    fire(TIMEOUT_MS);
    await expect(pending).rejects.toThrow(/timed out/i);
    expect(videos[0].removed).toBe(true);
  });

  it("keeps at most the allowed number of elements open, closing the least recently used", async () => {
    const { extractor, videos } = setup({ maxOpen: 2 });
    await extractor.frame("blob:a", 1);
    await extractor.frame("blob:b", 1);
    await extractor.frame("blob:a", 2); // a is now the most recently used
    await extractor.frame("blob:c", 1); // opening a third closes b, the least recently used
    expect(videos).toHaveLength(3);
    expect(videos[0].removed).toBe(false); // a stays
    expect(videos[1].removed).toBe(true); // b closed
    expect(videos[2].removed).toBe(false); // c open
  });

  it("closes everything and clears every timer on dispose", async () => {
    const { extractor, videos, timers } = setup();
    await extractor.frame("blob:a", 1);
    await extractor.frame("blob:b", 1);
    expect(timers.size).toBe(2);
    extractor.dispose();
    expect(videos.every((v) => v.removed)).toBe(true);
    expect(timers.size).toBe(0);
  });
});
