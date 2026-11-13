import { create } from "zustand";

export type SidebarTab = "media" | "assets" | "layers";

interface EditorUiStore {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  timelineCollapsed: boolean;
  toggleTimelineCollapsed: () => void;
  setTimelineCollapsed: (collapsed: boolean) => void;
  tourOpen: boolean;
  setTourOpen: (open: boolean) => void;
  exportOpen: boolean;
  setExportOpen: (open: boolean) => void;
  // Set while a tap-to-fill template placeholder is being filled from the
  // Media panel — cleared once a pick is made or the panel is closed.
  fillTargetObjectId: string | null;
  openMediaFillFor: (objectId: string) => void;
  clearFillTarget: () => void;
  // Where tapping a photo/video in the Media panel puts it: the story track
  // (plays in order, fills the frame) or loose on the canvas (collage-style).
  mediaPlacement: "story" | "canvas";
  setMediaPlacement: (placement: "story" | "canvas") => void;
  openMediaForStory: () => void;
}

export const useEditorUiStore = create<EditorUiStore>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  sidebarTab: "media",
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  timelineCollapsed: false,
  toggleTimelineCollapsed: () =>
    set((state) => ({ timelineCollapsed: !state.timelineCollapsed })),
  setTimelineCollapsed: (collapsed) => set({ timelineCollapsed: collapsed }),
  tourOpen: false,
  setTourOpen: (open) => set({ tourOpen: open }),
  exportOpen: false,
  setExportOpen: (open) => set({ exportOpen: open }),
  fillTargetObjectId: null,
  openMediaFillFor: (objectId) =>
    set({ fillTargetObjectId: objectId, sidebarOpen: true, sidebarTab: "media" }),
  clearFillTarget: () => set({ fillTargetObjectId: null }),
  mediaPlacement: "story",
  setMediaPlacement: (placement) => set({ mediaPlacement: placement }),
  openMediaForStory: () =>
    set({
      mediaPlacement: "story",
      fillTargetObjectId: null,
      sidebarOpen: true,
      sidebarTab: "media",
    }),
}));
