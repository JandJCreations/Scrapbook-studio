import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  emptyTimeline,
  parseSnapshot,
  parseTimeline,
  serializeSnapshot,
  serializeTimeline,
} from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";

export function createSupabaseTimelineStorage(client: SupabaseClient<Database>): TimelineStorage {
  return {
    async load(projectId) {
      const { data, error } = await client
        .from("projects")
        .select("timeline, timeline_rev, frame_width, frame_height")
        .eq("id", projectId)
        .single();
      if (error) throw error;

      const project =
        data.timeline == null ? emptyTimeline(projectId) : parseTimeline(projectId, data.timeline);
      return {
        project,
        rev: data.timeline_rev,
        frame: { width: data.frame_width, height: data.frame_height },
      };
    },

    async save(projectId, project, expectedRev) {
      // One UPDATE guarded by the revision: atomic, and zero rows means
      // someone else saved first (or the project is gone).
      const { data, error } = await client
        .from("projects")
        .update({ timeline: serializeTimeline(project), timeline_rev: expectedRev + 1 })
        .eq("id", projectId)
        .eq("timeline_rev", expectedRev)
        .select("timeline_rev");
      if (error) throw error;
      if (!data || data.length === 0) return { ok: false, reason: "conflict" };
      return { ok: true, rev: data[0].timeline_rev };
    },

    async saveVersion(projectId, project, frame, label) {
      const { error } = await client.from("project_versions").insert({
        project_id: projectId,
        label: label?.trim() || null,
        snapshot: serializeSnapshot(project, frame),
      });
      if (error) throw error;
    },

    async listVersions(projectId) {
      const { data, error } = await client
        .from("project_versions")
        .select("id, label, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
      }));
    },

    async loadVersion(projectId, versionId) {
      const { data, error } = await client
        .from("project_versions")
        .select("snapshot")
        .eq("id", versionId)
        .single();
      if (error || !data) throw error ?? new Error("Version not found");
      return parseSnapshot(projectId, data.snapshot);
    },

    async deleteVersion(versionId) {
      const { error } = await client.from("project_versions").delete().eq("id", versionId);
      if (error) throw error;
    },
  };
}
