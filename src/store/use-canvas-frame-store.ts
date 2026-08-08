import { create } from "zustand";

import { DEFAULT_FRAME_PRESET } from "@/lib/export/frame-presets";

export interface CanvasFrame {
  width: number;
  height: number;
}

const DEFAULT_FRAME: CanvasFrame = {
  width: DEFAULT_FRAME_PRESET.width,
  height: DEFAULT_FRAME_PRESET.height,
};

interface CanvasFrameStore {
  framesByProject: Record<string, CanvasFrame>;
  getFrame: (projectId: string) => CanvasFrame;
  setFrame: (projectId: string, frame: CanvasFrame) => void;
}

export const useCanvasFrameStore = create<CanvasFrameStore>((set, get) => ({
  framesByProject: {},
  getFrame: (projectId) => get().framesByProject[projectId] ?? DEFAULT_FRAME,
  setFrame: (projectId, frame) =>
    set((state) => ({
      framesByProject: { ...state.framesByProject, [projectId]: frame },
    })),
}));

export function useCanvasFrame(projectId: string): CanvasFrame {
  return useCanvasFrameStore(
    (s) => s.framesByProject[projectId] ?? DEFAULT_FRAME,
  );
}
