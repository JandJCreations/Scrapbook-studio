import { create } from "zustand";

interface VideoPlaybackStore {
  playingIds: Record<string, boolean>;
  play: (id: string) => void;
  pause: (id: string) => void;
  toggle: (id: string) => void;
  isPlaying: (id: string) => boolean;
}

export const useVideoPlaybackStore = create<VideoPlaybackStore>((set, get) => ({
  playingIds: {},
  play: (id) => set((state) => ({ playingIds: { ...state.playingIds, [id]: true } })),
  pause: (id) => set((state) => ({ playingIds: { ...state.playingIds, [id]: false } })),
  toggle: (id) =>
    set((state) => ({
      playingIds: { ...state.playingIds, [id]: !state.playingIds[id] },
    })),
  isPlaying: (id) => Boolean(get().playingIds[id]),
}));
