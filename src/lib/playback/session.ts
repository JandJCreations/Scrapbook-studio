import { createTransport, type Transport } from "@/lib/engine/transport";
import type { MediaElementKind } from "@/lib/engine/wanted";
import { createAudioGraph, type AudioContextLike, type AudioGraph } from "@/lib/playback/audio-graph";
import {
  createPlaybackEngine,
  type FrameInfo,
  type PlaybackEngine,
} from "@/lib/playback/engine";
import {
  createMediaPool,
  type MediaPool,
  type PoolElement,
  type PoolProblem,
} from "@/lib/playback/media-pool";
import { projectDuration } from "@/lib/timeline/clip-math";
import type { TimelineProject } from "@/types/timeline";

export interface PlaybackSessionDeps {
  getProject(): TimelineProject;
  audioContext: AudioContextLike;
  createElement(kind: MediaElementKind): PoolElement;
  urlFor(mediaId: string): string | null;
  /** Monotonic clock in seconds. */
  now(): number;
  schedule(callback: () => void): () => void;
  /** Called after each frame's media plan is applied; the picture redraws here. */
  onFrame(frame: FrameInfo, pool: MediaPool): void;
  onProblem?(problem: PoolProblem): void;
  /** Called once at the end of dispose (revoke object URLs here). */
  onDispose?(): void;
}

export interface PlaybackSession {
  transport: Transport;
  pool: MediaPool;
  graph: AudioGraph;
  /** Call from the Play click: resumes audio and starts playback inside the gesture. */
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  step(direction: 1 | -1, fps: number): void;
  /** Re-plans and redraws once (after an edit, or when media appears while paused). */
  wake(): void;
  problems(): PoolProblem[];
  dispose(): Promise<void>;
}

/** Owns the transport, pool, audio graph and engine, and the rules for the Play click. */
export function createPlaybackSession(deps: PlaybackSessionDeps): PlaybackSession {
  const transport = createTransport({
    now: deps.now,
    duration: () => projectDuration(deps.getProject()),
  });
  const graph = createAudioGraph(deps.audioContext);
  const problems: PoolProblem[] = [];
  let engine: PlaybackEngine | null = null;
  let disposed = false;

  const pool = createMediaPool({
    createElement: deps.createElement,
    urlFor: deps.urlFor,
    attachGain: (element) => graph.attach(element),
    onProblem: (problem) => {
      problems.push(problem);
      deps.onProblem?.(problem);
    },
    onElementReady: () => engine?.wake(),
  });

  const playback = createPlaybackEngine({
    transport,
    getProject: deps.getProject,
    pool,
    schedule: deps.schedule,
    onFrame: (frame) => deps.onFrame(frame, pool),
  });
  engine = playback;

  function wake() {
    if (!disposed) playback.wake();
  }

  return {
    transport,
    pool,
    graph,

    play() {
      if (disposed) return;
      // Not awaited: the first play() must happen inside the click, and the
      // context finishes resuming a moment later.
      graph.resume().catch(() => {});
      transport.play();
      wake();
    },

    pause() {
      transport.pause();
      wake();
    },

    toggle() {
      if (transport.isPlaying()) this.pause();
      else this.play();
    },

    seek(time) {
      transport.seek(time);
      wake();
    },

    step(direction, fps) {
      transport.stepFrame(direction, fps);
      wake();
    },

    wake,

    problems: () => [...problems],

    async dispose() {
      if (disposed) return;
      disposed = true;
      playback.dispose();
      await graph.close().catch(() => {});
      deps.onDispose?.();
    },
  };
}
