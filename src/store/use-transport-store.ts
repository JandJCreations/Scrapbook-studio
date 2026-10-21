import { create } from "zustand";

interface TransportStore {
  time: number;
  playing: boolean;
  setFrame: (time: number, playing: boolean) => void;
  reset: () => void;
}

/** A read-only mirror of the transport for the UI; the engine writes it each frame. */
export const useTransportStore = create<TransportStore>((set) => ({
  time: 0,
  playing: false,
  setFrame: (time, playing) =>
    set((state) => (state.time === time && state.playing === playing ? state : { time, playing })),
  reset: () => set({ time: 0, playing: false }),
}));
