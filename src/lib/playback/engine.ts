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

  // A function (not inline code) because a re-entrant frame can set `cancel`
  // while another frame is running, which control-flow analysis cannot see.
  function cancelPending() {
    cancel?.();
    cancel = null;
  }

  function frame() {
    cancel = null;
    if (disposed) return;

    let playing = false;
    try {
      const { time, ended } = transport.tick();
      playing = transport.isPlaying();

      // Apply the plan before notifying, so the picture only ever asks for an
      // element that has already been assigned to its clip.
      pool.apply(planMediaSync(getProject(), time, playing, pool.slots()));
      onFrame({ time, playing, ended });
    } finally {
      // Always keep the loop going while playing, even if drawing threw:
      // otherwise the elements keep playing with nothing driving the transport.
      // Cancel first, so a wake() made from inside onFrame cannot leave two loops.
      if (playing && !disposed) {
        cancelPending();
        cancel = schedule(frame);
      }
    }
  }

  return {
    wake() {
      if (disposed) return;
      cancelPending();
      frame();
    },

    dispose() {
      disposed = true;
      cancelPending();
      pool.dispose();
    },
  };
}
