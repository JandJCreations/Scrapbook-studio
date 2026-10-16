import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { getSignedUrls } from "@/lib/supabase/storage";
import type { MediaRow, MediaUrlDeps } from "@/lib/sync/media-urls";

export function createSupabaseMediaDeps(client: SupabaseClient<Database>): MediaUrlDeps {
  return {
    async fetchMediaRows(ids) {
      const { data, error } = await client
        .from("media_items")
        .select("id, type, storage_path, thumbnail_path")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
    getSignedUrls,
  };
}
