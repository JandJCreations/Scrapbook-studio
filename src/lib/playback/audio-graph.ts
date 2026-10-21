import type { GainControl, PoolElement } from "@/lib/playback/media-pool";

/** Smoothing for gain changes: about 99% of the way there after 10 ms. */
export const GAIN_TIME_CONSTANT = 0.002;

/** The parts of the Web Audio API the graph uses; the real classes fit. */
export interface AudioParamLike {
  value: number;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createGain(): GainNodeLike;
  createMediaElementSource(element: PoolElement): AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioGraph {
  /** Routes an element's sound through its own gain; the same control on repeat calls. */
  attach(element: PoolElement): GainControl;
  /** Call from a user gesture (the first Play click): browsers start the context suspended. */
  resume(): Promise<void>;
  isRunning(): boolean;
  close(): Promise<void>;
}

export function createAudioGraph(ctx: AudioContextLike): AudioGraph {
  const master = ctx.createGain();
  master.connect(ctx.destination);

  // createMediaElementSource throws if called twice for one element.
  const controls = new WeakMap<PoolElement, GainControl>();

  return {
    attach(element) {
      const existing = controls.get(element);
      if (existing) return existing;

      const source = ctx.createMediaElementSource(element);
      const gain = ctx.createGain();
      gain.gain.value = 0; // silent until the pool sets a real gain
      source.connect(gain);
      gain.connect(master);

      const control: GainControl = {
        set(value) {
          const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
          gain.gain.setTargetAtTime(safe, ctx.currentTime, GAIN_TIME_CONSTANT);
        },
      };
      controls.set(element, control);
      return control;
    },

    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
    },

    isRunning: () => ctx.state === "running",

    close: () => ctx.close(),
  };
}
