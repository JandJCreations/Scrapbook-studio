import { planMediaSync } from "@/lib/engine/media-sync";
import type { Transport } from "@/lib/engine/transport";
import type { MediaPool } from "@/lib/playback/media-pool";
import type { TimelineProject } from "@/types/timeline";

export interface FrameInfo {
  time: number;
  playing: boolean;
  ended: boolean;
}

export interface PlaybackEngineDeps {
  transport: Transport;
  getProject: () => TimelineProject;
  pool: MediaPool;
  /** Runs the callback on the next frame; returns a function that cancels it. */
  schedule: (callback: () => void) => () => void;
  /** Called after the media plan is applied; the picture redraws here. */
  onFrame: (frame: FrameInfo) => void;
}

export interface PlaybackEngine {
  /**
   * Runs one frame now (cancelling any pending one). Call after play, pause,
   * seek, frame-step or an edit. Frames then repeat while the transport plays.
   */
  wake(): void;
  dispose(): void;
}

export function createPlaybackEngine(deps: PlaybackEngineDeps): PlaybackEngine {
  const { transport, getProject, pool, schedule, onFrame } = deps;
  let cancel: (() => void) | null = null;
  let disposed = false;

  function frame() {
    cancel = null;
    if (disposed) return;

    const { time, ended } = transport.tick();
    const playing = transport.isPlaying();

    // Apply the plan before notifying, so the picture only ever asks for an
    // element that has already been assigned to its clip.
    pool.apply(planMediaSync(getProject(), time, playing, pool.slots()));
    onFrame({ time, playing, ended });

    if (playing) cancel = schedule(frame);
  }

  return {
    wake() {
      if (disposed) return;
      cancel?.();
      cancel = null;
      frame();
    },

    dispose() {
      disposed = true;
      cancel?.();
      cancel = null;
      pool.dispose();
    },
  };
}
