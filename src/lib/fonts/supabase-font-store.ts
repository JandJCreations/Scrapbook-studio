import type { SupabaseClient } from "@supabase/supabase-js";

import type { FontRow, FontStore } from "@/lib/fonts/custom-font-service";
import { cssUrl } from "@/lib/fonts/custom-fonts";
import { getSignedUrls, MEDIA_BUCKET } from "@/lib/supabase/storage";

/** The font store on Supabase: the `custom_fonts` table, and the user's media bucket for the files. */
export function createSupabaseFontStore(client: SupabaseClient): FontStore {
  return {
    async userId() {
      const {
        data: { user },
      } = await client.auth.getUser();
      return user?.id ?? null;
    },
    async rows() {
      const { data, error } = await client
        .from("custom_fonts")
        .select("id, name, family, storage_path")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FontRow[];
    },
    signedUrls: (paths) => getSignedUrls(paths),
    async upload(path, file) {
      const { error } = await client.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type || "font/ttf" });
      if (error) throw new Error(error.message);
    },
    async remove(path) {
      await client.storage.from(MEDIA_BUCKET).remove([path]);
    },
    async insert(row) {
      const { error } = await client.from("custom_fonts").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}

/** Has the browser load a font (from bytes or a URL) and make it available to the page's canvases. */
export async function loadBrowserFontFace(family: string, source: ArrayBuffer | string): Promise<void> {
  const face = new FontFace(family, typeof source === "string" ? cssUrl(source) : source);
  await face.load();
  document.fonts.add(face);
}
