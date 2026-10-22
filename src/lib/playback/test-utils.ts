import type { MediaElementKind } from "@/lib/engine/wanted";
import type {
  GainControl,
  MediaPoolDeps,
  PoolElement,
  PoolProblem,
} from "@/lib/playback/media-pool";

/** A media element that records what was done to it and can simulate playing. */
export class FakeElement implements PoolElement {
  playbackRate = 1;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  /** How many times `src` was assigned (loads). */
  srcSets = 0;
  /** Every value assigned to `currentTime` (seeks), in order. */
  seeks: number[] = [];
  /** When set, play() rejects the way a browser blocking autoplay does. */
  playError: Error | null = null;
  /** Length of the media; advance() stops (ended, paused) when it is reached. */
  duration = Infinity;
  /** True once playback reached the end, until the element is seeked away from it. */
  ended = false;
  /** How many times play() restarted an ended element from 0, as browsers do. */
  restarts = 0;

  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  /** Fires the listeners registered for an event, the way the browser would. */
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  private time = 0;
  private source = "";

  get currentTime(): number {
    return this.time;
  }
  set currentTime(value: number) {
    this.seeks.push(value);
    this.time = value;
    this.ended = value >= this.duration;
  }

  get src(): string {
    return this.source;
  }
  set src(value: string) {
    this.srcSets += 1;
    this.source = value;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.playError) return Promise.reject(this.playError);
    if (this.ended) {
      // Per the HTML spec, play() on an ended element starts again from 0.
      this.time = 0;
      this.ended = false;
      this.restarts += 1;
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  /** Simulates the browser playing for `seconds` of wall-clock time (not a seek). */
  advance(seconds: number): void {
    if (this.paused) return;
    this.time += seconds * this.playbackRate;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.paused = true;
      this.ended = true;
    }
  }
}

export class FakeGain implements GainControl {
  values: number[] = [];

  set(gain: number): void {
    this.values.push(gain);
  }

  get last(): number | undefined {
    return this.values[this.values.length - 1];
  }
}

/**
 * Pool dependencies backed by fakes. `urls` maps a media id to a URL, or to
 * null for "missing"; ids not listed get `blob:<id>`.
 */
export function makeFakePoolDeps(
  options: { urls?: Record<string, string | null>; playError?: Error } = {},
) {
  const urls = options.urls ?? {};
  const created: Array<{ kind: MediaElementKind; element: FakeElement }> = [];
  const gains = new Map<PoolElement, FakeGain>();
  const problems: PoolProblem[] = [];
  const ready = { count: 0 };

  const deps: MediaPoolDeps = {
    createElement(kind) {
      const element = new FakeElement();
      element.playError = options.playError ?? null;
      created.push({ kind, element });
      return element;
    },
    urlFor: (mediaId) => (mediaId in urls ? urls[mediaId] : `blob:${mediaId}`),
    attachGain(element) {
      const gain = new FakeGain();
      gains.set(element, gain);
      return gain;
    },
    onProblem: (problem) => {
      problems.push(problem);
    },
    onElementReady: () => {
      ready.count += 1;
    },
  };

  return { deps, urls, created, gains, problems, ready };
}
