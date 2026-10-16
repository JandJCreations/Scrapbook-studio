export interface TransportOptions {
  /** Any monotonic clock in seconds (the glue can pass the Web Audio clock). */
  now: () => number;
  /** The project length; read every call so edits during playback are seen. */
  duration: () => number;
}

export interface Transport {
  time(): number;
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  /** Pauses, then moves to the next (1) or previous (-1) frame boundary. */
  stepFrame(direction: 1 | -1, fps: number): void;
  /** Advances; stops playback at the end and reports `ended` exactly once. */
  tick(): { time: number; ended: boolean };
}

export function createTransport({ now, duration }: TransportOptions): Transport {
  let playing = false;
  let baseTime = 0; // timeline seconds at the moment of `anchor`
  let anchor = 0; // clock reading when baseTime was set

  function clampTime(t: number): number {
    return Math.min(Math.max(t, 0), Math.max(duration(), 0));
  }

  function time(): number {
    return playing ? clampTime(baseTime + (now() - anchor)) : clampTime(baseTime);
  }

  function pause() {
    baseTime = time();
    playing = false;
  }

  function play() {
    const length = duration();
    if (length <= 0) return;
    const current = time();
    baseTime = current >= length ? 0 : current;
    anchor = now();
    playing = true;
  }

  return {
    time,
    isPlaying: () => playing,
    play,
    pause,
    toggle() {
      if (playing) pause();
      else play();
    },
    seek(t) {
      baseTime = clampTime(t);
      anchor = now();
    },
    stepFrame(direction, fps) {
      pause();
      const frames = time() * fps;
      const next =
        direction > 0 ? Math.floor(frames + 1e-9) + 1 : Math.ceil(frames - 1e-9) - 1;
      baseTime = clampTime(next / fps);
    },
    tick() {
      const current = time();
      if (playing && current >= duration()) {
        baseTime = current;
        playing = false;
        return { time: current, ended: true };
      }
      return { time: current, ended: false };
    },
  };
}
