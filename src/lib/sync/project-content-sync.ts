import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { getSignedUrls } from "@/lib/supabase/storage";
import type { CanvasObject } from "@/types/canvas";
import type { AudioClip, AudioTrack } from "@/types/audio";
import type { Keyframe } from "@/types/keyframe";
import type { PhotoAdjustments } from "@/types/photo-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";
import type { TextAdjustments } from "@/types/text-adjustments";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Canvas objects and audio clips store a signed Storage URL in `src`/`videoSrc`
 * at the moment they're placed, but signed URLs expire. Re-resolve them from
 * `mediaId` (which is stable) to fresh URLs on every load. Objects sourced from
 * bundled stickers/templates use synthetic non-UUID mediaIds and are skipped —
 * their `src` is permanent inline data, not Storage-backed.
 */
async function resolveMediaUrls(objects: CanvasObject[], clips: AudioClip[]) {
  const mediaIds = new Set<string>();
  for (const o of objects) if (o.mediaId && UUID_RE.test(o.mediaId)) mediaIds.add(o.mediaId);
  for (const c of clips) if (c.mediaId && UUID_RE.test(c.mediaId)) mediaIds.add(c.mediaId);
  if (mediaIds.size === 0) return;

  const supabase = createClient();
  const { data: mediaRows } = await supabase
    .from("media_items")
    .select("id, type, storage_path, thumbnail_path")
    .in("id", Array.from(mediaIds));
  if (!mediaRows || mediaRows.length === 0) return;

  const paths = mediaRows.flatMap((r) =>
    [r.storage_path, r.thumbnail_path].filter((p): p is string => Boolean(p)),
  );
  const signedUrls = await getSignedUrls(paths);
  const byId = new Map(mediaRows.map((r) => [r.id, r]));

  for (const o of objects) {
    const media = o.mediaId ? byId.get(o.mediaId) : undefined;
    if (!media) continue;
    if (media.type === "video") {
      const posterUrl = media.thumbnail_path ? signedUrls.get(media.thumbnail_path) : undefined;
      const videoUrl = signedUrls.get(media.storage_path);
      if (posterUrl) o.src = posterUrl;
      if (videoUrl) o.videoSrc = videoUrl;
    } else if (media.type === "image") {
      const url = signedUrls.get(media.storage_path);
      if (url) o.src = url;
    }
  }

  for (const c of clips) {
    const media = c.mediaId ? byId.get(c.mediaId) : undefined;
    if (!media) continue;
    const url = signedUrls.get(media.storage_path);
    if (url) c.src = url;
  }
}

type CanvasObjectRow = Database["public"]["Tables"]["canvas_objects"]["Row"];
type CanvasObjectInsert = Database["public"]["Tables"]["canvas_objects"]["Insert"];
type AudioTrackRow = Database["public"]["Tables"]["audio_tracks"]["Row"];
type AudioTrackInsert = Database["public"]["Tables"]["audio_tracks"]["Insert"];
type AudioClipRow = Database["public"]["Tables"]["audio_clips"]["Row"];
type AudioClipInsert = Database["public"]["Tables"]["audio_clips"]["Insert"];

function rowToCanvasObject(row: CanvasObjectRow): CanvasObject {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    mediaId: row.media_id ?? "",
    src: row.src,
    videoSrc: row.video_src,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    locked: row.locked,
    groupId: row.group_id,
    adjustments: row.adjustments as PhotoAdjustments | null,
    videoAdjustments: row.video_adjustments as VideoAdjustments | null,
    textAdjustments: row.text_adjustments as TextAdjustments | null,
    startTime: row.start_time,
    endTime: row.end_time,
    fadeIn: row.fade_in,
    fadeOut: row.fade_out,
    keyframes: (row.keyframes as Keyframe[] | null) ?? [],
  };
}

function canvasObjectToRow(
  projectId: string,
  object: CanvasObject,
  sortOrder: number,
): CanvasObjectInsert {
  return {
    id: object.id,
    project_id: projectId,
    type: object.type,
    name: object.name,
    media_id: object.mediaId || null,
    src: object.src,
    video_src: object.videoSrc,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    locked: object.locked,
    group_id: object.groupId,
    adjustments: object.adjustments,
    video_adjustments: object.videoAdjustments,
    text_adjustments: object.textAdjustments,
    start_time: object.startTime,
    end_time: object.endTime,
    fade_in: object.fadeIn,
    fade_out: object.fadeOut,
    keyframes: object.keyframes,
    sort_order: sortOrder,
  };
}

function rowToAudioTrack(row: AudioTrackRow): AudioTrack {
  return { id: row.id, name: row.name, muted: row.muted, solo: row.solo };
}

function audioTrackToRow(
  projectId: string,
  track: AudioTrack,
  sortOrder: number,
): AudioTrackInsert {
  return {
    id: track.id,
    project_id: projectId,
    name: track.name,
    muted: track.muted,
    solo: track.solo,
    sort_order: sortOrder,
  };
}

function rowToAudioClip(row: AudioClipRow): AudioClip {
  return {
    id: row.id,
    trackId: row.track_id,
    mediaId: row.media_id ?? "",
    src: row.src,
    name: row.name,
    startTime: row.start_time,
    trimStart: row.trim_start,
    trimEnd: row.trim_end,
    sourceDuration: row.source_duration,
    volume: row.volume,
    fadeIn: row.fade_in,
    fadeOut: row.fade_out,
    loop: row.loop,
    muted: row.muted,
    waveformPeaks: row.waveform_peaks as number[] | null,
  };
}

function audioClipToRow(projectId: string, clip: AudioClip): AudioClipInsert {
  return {
    id: clip.id,
    project_id: projectId,
    track_id: clip.trackId,
    media_id: clip.mediaId || null,
    src: clip.src,
    name: clip.name,
    start_time: clip.startTime,
    trim_start: clip.trimStart,
    trim_end: clip.trimEnd,
    source_duration: clip.sourceDuration,
    volume: clip.volume,
    fade_in: clip.fadeIn,
    fade_out: clip.fadeOut,
    loop: clip.loop,
    muted: clip.muted,
    waveform_peaks: clip.waveformPeaks,
  };
}

async function deleteMissing(
  supabase: ReturnType<typeof createClient>,
  table: "canvas_objects" | "audio_tracks" | "audio_clips",
  projectId: string,
  keepIds: string[],
) {
  let query = supabase.from(table).delete().eq("project_id", projectId);
  if (keepIds.length > 0) {
    query = query.not("id", "in", `(${keepIds.join(",")})`);
  }
  const { error } = await query;
  if (error) throw error;
}

export interface ProjectContent {
  objects: CanvasObject[];
  tracks: AudioTrack[];
  clips: AudioClip[];
  frame: { width: number; height: number } | null;
}

export async function loadProjectContent(projectId: string): Promise<ProjectContent> {
  const supabase = createClient();

  const [objectsRes, tracksRes, clipsRes, projectRes] = await Promise.all([
    supabase
      .from("canvas_objects")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("audio_tracks")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase.from("audio_clips").select("*").eq("project_id", projectId),
    supabase
      .from("projects")
      .select("frame_width, frame_height")
      .eq("id", projectId)
      .single(),
  ]);

  if (objectsRes.error) throw objectsRes.error;
  if (tracksRes.error) throw tracksRes.error;
  if (clipsRes.error) throw clipsRes.error;

  const objects = (objectsRes.data ?? []).map(rowToCanvasObject);
  const tracks = (tracksRes.data ?? []).map(rowToAudioTrack);
  const clips = (clipsRes.data ?? []).map(rowToAudioClip);

  await resolveMediaUrls(objects, clips);

  return {
    objects,
    tracks,
    clips,
    frame: projectRes.data
      ? { width: projectRes.data.frame_width, height: projectRes.data.frame_height }
      : null,
  };
}

export async function saveProjectContent(
  projectId: string,
  objects: CanvasObject[],
  tracks: AudioTrack[],
  clips: AudioClip[],
): Promise<void> {
  const supabase = createClient();

  const objectRows = objects.map((o, i) => canvasObjectToRow(projectId, o, i));
  if (objectRows.length > 0) {
    const { error } = await supabase.from("canvas_objects").upsert(objectRows);
    if (error) throw error;
  }
  await deleteMissing(
    supabase,
    "canvas_objects",
    projectId,
    objects.map((o) => o.id),
  );

  const trackRows = tracks.map((t, i) => audioTrackToRow(projectId, t, i));
  if (trackRows.length > 0) {
    const { error } = await supabase.from("audio_tracks").upsert(trackRows);
    if (error) throw error;
  }
  await deleteMissing(
    supabase,
    "audio_tracks",
    projectId,
    tracks.map((t) => t.id),
  );

  const clipRows = clips.map((c) => audioClipToRow(projectId, c));
  if (clipRows.length > 0) {
    const { error } = await supabase.from("audio_clips").upsert(clipRows);
    if (error) throw error;
  }
  await deleteMissing(
    supabase,
    "audio_clips",
    projectId,
    clips.map((c) => c.id),
  );

  await supabase
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

export async function saveProjectFrame(
  projectId: string,
  frame: { width: number; height: number },
): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("projects")
    .update({ frame_width: frame.width, frame_height: frame.height })
    .eq("id", projectId);
}

export interface ProjectSnapshot {
  objects: CanvasObject[];
  tracks: AudioTrack[];
  clips: AudioClip[];
  frame: { width: number; height: number };
}

export interface ProjectVersionSummary {
  id: string;
  label: string | null;
  createdAt: string;
}

export async function saveProjectVersion(
  projectId: string,
  snapshot: ProjectSnapshot,
  label?: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("project_versions").insert({
    project_id: projectId,
    label: label?.trim() || null,
    snapshot,
  });
  if (error) throw error;
}

export async function listProjectVersions(
  projectId: string,
): Promise<ProjectVersionSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_versions")
    .select("id, label, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }));
}

export async function loadProjectVersion(versionId: string): Promise<ProjectSnapshot> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_versions")
    .select("snapshot")
    .eq("id", versionId)
    .single();
  if (error || !data) throw error ?? new Error("Version not found");

  const snapshot = data.snapshot as ProjectSnapshot;
  await resolveMediaUrls(snapshot.objects, snapshot.clips);
  return snapshot;
}

export async function deleteProjectVersion(versionId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("project_versions").delete().eq("id", versionId);
}
