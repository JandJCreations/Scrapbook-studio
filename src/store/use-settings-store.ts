import { create } from "zustand";

import { DEFAULT_FRAME_PRESET } from "@/lib/export/frame-presets";
import type { ExportFormat } from "@/lib/export/export-formats";

interface SettingsStore {
  defaultExportFormat: ExportFormat;
  defaultResolutionId: string;
  defaultFramePresetId: string;
  setDefaultExportFormat: (format: ExportFormat) => void;
  setDefaultResolutionId: (id: string) => void;
  setDefaultFramePresetId: (id: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  defaultExportFormat: "png",
  defaultResolutionId: "1080p",
  defaultFramePresetId: DEFAULT_FRAME_PRESET.id,
  setDefaultExportFormat: (format) => set({ defaultExportFormat: format }),
  setDefaultResolutionId: (id) => set({ defaultResolutionId: id }),
  setDefaultFramePresetId: (id) => set({ defaultFramePresetId: id }),
}));
