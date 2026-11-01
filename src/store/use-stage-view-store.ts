import { create } from "zustand";

import { DEFAULT_VIEW, type ViewState } from "@/lib/editor/view";

interface StageViewStore {
  view: ViewState;
  setView(view: ViewState): void;
  reset(): void;
}

/** How the studio's stage is zoomed and panned. Only the live stage reads it; export and thumbnails never do. */
export const useStageViewStore = create<StageViewStore>((set) => ({
  view: DEFAULT_VIEW,
  setView: (view) => set({ view }),
  reset: () => set({ view: DEFAULT_VIEW }),
}));
