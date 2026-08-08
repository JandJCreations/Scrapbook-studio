import { create } from "zustand";

import { DEFAULT_FRAME_PRESET } from "@/lib/export/frame-presets";
import type { ExportFormat } from "@/lib/export/export-formats";
import { createClient } from "@/lib/supabase/client";

interface SettingsStore {
  defaultExportFormat: ExportFormat;
  defaultResolutionId: string;
  defaultFramePresetId: string;
  loaded: boolean;
  loading: boolean;
  fetchSettings: () => Promise<void>;
  setDefaultExportFormat: (format: ExportFormat) => void;
  setDefaultResolutionId: (id: string) => void;
  setDefaultFramePresetId: (id: string) => void;
}

async function upsertSettings(
  patch: Partial<{
    default_export_format: string;
    default_resolution_id: string;
    default_frame_preset_id: string;
  }>,
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("user_settings")
    .upsert({ owner_id: user.id, ...patch }, { onConflict: "owner_id" });
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  defaultExportFormat: "png",
  defaultResolutionId: "1080p",
  defaultFramePresetId: DEFAULT_FRAME_PRESET.id,
  loaded: false,
  loading: false,

  fetchSettings: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ loading: false, loaded: true });
      return;
    }

    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (data) {
      set({
        defaultExportFormat: data.default_export_format as ExportFormat,
        defaultResolutionId: data.default_resolution_id,
        defaultFramePresetId: data.default_frame_preset_id,
      });
    }
    set({ loading: false, loaded: true });
  },

  setDefaultExportFormat: (format) => {
    set({ defaultExportFormat: format });
    void upsertSettings({ default_export_format: format });
  },
  setDefaultResolutionId: (id) => {
    set({ defaultResolutionId: id });
    void upsertSettings({ default_resolution_id: id });
  },
  setDefaultFramePresetId: (id) => {
    set({ defaultFramePresetId: id });
    void upsertSettings({ default_frame_preset_id: id });
  },
}));
