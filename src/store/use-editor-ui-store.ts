import { create } from "zustand";

interface EditorUiStore {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  timelineCollapsed: boolean;
  toggleTimelineCollapsed: () => void;
  setTimelineCollapsed: (collapsed: boolean) => void;
  tourOpen: boolean;
  setTourOpen: (open: boolean) => void;
}

export const useEditorUiStore = create<EditorUiStore>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  timelineCollapsed: false,
  toggleTimelineCollapsed: () =>
    set((state) => ({ timelineCollapsed: !state.timelineCollapsed })),
  setTimelineCollapsed: (collapsed) => set({ timelineCollapsed: collapsed }),
  tourOpen: false,
  setTourOpen: (open) => set({ tourOpen: open }),
}));
