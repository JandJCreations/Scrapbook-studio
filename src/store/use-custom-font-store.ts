import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";
import { getSignedUrls, MEDIA_BUCKET } from "@/lib/supabase/storage";

export interface CustomFont {
  id: string;
  name: string;
  family: string;
}

interface CustomFontStore {
  fonts: CustomFont[];
  loaded: boolean;
  loading: boolean;
  fetchFonts: () => Promise<void>;
  addFont: (file: File) => Promise<CustomFont>;
}

function storagePathFor(userId: string, fontId: string, filename: string) {
  return `${userId}/fonts/${fontId}/${filename}`;
}

export const useCustomFontStore = create<CustomFontStore>((set, get) => ({
  fonts: [],
  loaded: false,
  loading: false,

  fetchFonts: async () => {
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

    const { data, error } = await supabase
      .from("custom_fonts")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data) {
      set({ loading: false, loaded: true });
      return;
    }

    const signedUrls = await getSignedUrls(data.map((row) => row.storage_path));
    const fonts: CustomFont[] = [];

    for (const row of data) {
      const url = signedUrls.get(row.storage_path);
      if (!url) continue;
      try {
        const fontFace = new FontFace(row.family, `url(${url})`);
        await fontFace.load();
        document.fonts.add(fontFace);
        fonts.push({ id: row.id, name: row.name, family: row.family });
      } catch {
        // Skip fonts that fail to load rather than blocking the rest.
      }
    }

    set({ fonts, loading: false, loaded: true });
  },

  addFont: async (file) => {
    const name = file.name.replace(/\.[^.]+$/, "");
    const fontId = crypto.randomUUID();
    const family = `custom-${fontId}`;
    const buffer = await file.arrayBuffer();
    const fontFace = new FontFace(family, buffer);
    await fontFace.load();
    document.fonts.add(fontFace);

    const font: CustomFont = { id: fontId, name, family };
    set((state) => ({ fonts: [font, ...state.fonts] }));

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const storagePath = storagePathFor(user.id, fontId, file.name);
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, file, { contentType: file.type || "font/ttf" });
      if (!uploadError) {
        await supabase.from("custom_fonts").insert({
          id: fontId,
          owner_id: user.id,
          name,
          family,
          storage_path: storagePath,
        });
      }
    }

    return font;
  },
}));
