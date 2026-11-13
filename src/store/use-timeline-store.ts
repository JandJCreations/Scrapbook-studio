import { create } from "zustand";

export const MIN_PIXELS_PER_SECOND = 10;
export const MAX_PIXELS_PER_SECOND = 200;
export const DEFAULT_PIXELS_PER_SECOND = 40;

interface TimelineStore {
  playheadTime: number;
  isPlaying: boolean;
  /** A voiceover is being recorded — project audio stays silent meanwhile. */
  recording: boolean;
  /**
   * Volume multiplier for non-voiceover audio right now (1 = full, lower
   * while a voiceover speaks). Kept here so video sound ducks too.
   */
  duckFactor: number;
  setRecording: (recording: boolean) => void;
  pixelsPerSecond: number;

  setPlayheadTime: (time: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setZoom: (pixelsPerSecond: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  playheadTime: 0,
  isPlaying: false,
  recording: false,
  duckFactor: 1,
  setRecording: (recording) => set({ recording }),
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,

  setPlayheadTime: (time) => set({ playheadTime: Math.max(0, time) }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setZoom: (pixelsPerSecond) =>
    set({
      pixelsPerSecond: Math.min(
        MAX_PIXELS_PER_SECOND,
        Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond),
      ),
    }),
  zoomIn: () =>
    set((state) => ({
      pixelsPerSecond: Math.min(MAX_PIXELS_PER_SECOND, state.pixelsPerSecond * 1.4),
    })),
  zoomOut: () =>
    set((state) => ({
      pixelsPerSecond: Math.max(MIN_PIXELS_PER_SECOND, state.pixelsPerSecond / 1.4),
    })),
}));
