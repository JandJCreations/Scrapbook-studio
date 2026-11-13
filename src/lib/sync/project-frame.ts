import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { FrameSize } from "@/lib/sync/timeline-document";

/** Saves a project's frame size; throws when the save fails (unlike the old helper, which swallowed errors). */
export async function saveProjectFrameChecked(
  client: SupabaseClient<Database>,
  projectId: string,
  frame: FrameSize,
): Promise<void> {
  const { error } = await client
    .from("projects")
    .update({ frame_width: frame.width, frame_height: frame.height })
    .eq("id", projectId);
  if (error) throw error;
}
