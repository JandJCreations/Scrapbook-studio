import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";
import { getSignedUrl, getSignedUrls, MEDIA_BUCKET } from "@/lib/supabase/storage";

export interface CustomSticker {
  id: string;
  name: string;
  src: string;
}

interface StickerStore {
  stickers: CustomSticker[];
  loaded: boolean;
  loading: boolean;
  fetchStickers: () => Promise<void>;
  addSticker: (file: File) => void;
  removeSticker: (id: string) => void;
}

function storagePathFor(userId: string, stickerId: string, filename: string) {
  return `${userId}/stickers/${stickerId}/${filename}`;
}

export const useStickerStore = create<StickerStore>((set, get) => ({
  stickers: [],
  loaded: false,
  loading: false,

  fetchStickers: async () => {
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
      .from("custom_stickers")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data) {
      set({ loading: false, loaded: true });
      return;
    }

    const signedUrls = await getSignedUrls(data.map((row) => row.storage_path));
    const stickers: CustomSticker[] = data
      .map((row) => ({
        id: row.id,
        name: row.name,
        src: signedUrls.get(row.storage_path) ?? "",
      }))
      .filter((s) => s.src);

    set({ stickers, loading: false, loaded: true });
  },

  addSticker: (file) => {
    const localUrl = URL.createObjectURL(file);
    const stickerId = crypto.randomUUID();
    const name = file.name.replace(/\.[^.]+$/, "");
    const sticker: CustomSticker = { id: stickerId, name, src: localUrl };
    set((state) => ({ stickers: [sticker, ...state.stickers] }));

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const storagePath = storagePathFor(user.id, stickerId, file.name);
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) return;

      await supabase.from("custom_stickers").insert({
        id: stickerId,
        owner_id: user.id,
        name,
        storage_path: storagePath,
      });

      const url = await getSignedUrl(storagePath);
      if (url) {
        set((state) => ({
          stickers: state.stickers.map((s) =>
            s.id === stickerId ? { ...s, src: url } : s,
          ),
        }));
      }
      URL.revokeObjectURL(localUrl);
    })();
  },

  removeSticker: (stickerId) => {
    set((state) => {
      const target = state.stickers.find((s) => s.id === stickerId);
      if (target?.src.startsWith("blob:")) URL.revokeObjectURL(target.src);
      return { stickers: state.stickers.filter((s) => s.id !== stickerId) };
    });

    (async () => {
      const supabase = createClient();
      const { data: row } = await supabase
        .from("custom_stickers")
        .select("storage_path")
        .eq("id", stickerId)
        .single();
      if (row) await supabase.storage.from(MEDIA_BUCKET).remove([row.storage_path]);
      await supabase.from("custom_stickers").delete().eq("id", stickerId);
    })();
  },
}));
