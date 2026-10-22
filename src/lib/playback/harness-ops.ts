import { fitContain } from "@/lib/playback/scene";
import { projectDuration } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { insertClip } from "@/lib/timeline/place";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, TimelineProject, TrackType } from "@/types/timeline";

export const HARNESS_FRAME = { width: 1280, height: 720 };
export const IMAGE_CLIP_SECONDS = 5;

export interface MediaItem {
  mediaId: string;
  name: string;
  kind: "video" | "audio" | "image";
  /** Seconds; 0 for images. */
  duration: number;
  /** Natural size in pixels; 0 when unknown. */
  width: number;
  height: number;
}

function ensureTrack(
  project: TimelineProject,
  type: TrackType,
  newId: IdFn,
): { project: TimelineProject; trackId: string } {
  const existing = project.tracks.find((track) => track.type === type);
  if (existing) return { project, trackId: existing.id };

  const next = addTrack(project, type, newId);
  const created = next.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");
  return { project: next, trackId: created.id };
}

function buildClip(item: MediaItem, trackId: string, start: number, newId: IdFn): Clip {
  const still = item.kind === "image";
  const length = still ? IMAGE_CLIP_SECONDS : item.duration;
  const box =
    item.kind === "audio"
      ? { x: 0, y: 0, ...HARNESS_FRAME }
      : fitContain(item.width, item.height, HARNESS_FRAME.width, HARNESS_FRAME.height);

  return {
    id: newId(),
    trackId,
    kind: item.kind,
    name: item.name,
    mediaId: item.mediaId,
    sourceDuration: still ? null : item.duration,
    start,
    sourceIn: 0,
    sourceOut: length,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...box, rotation: 0, opacity: 1 },
    adjustments: { photo: null, video: null, text: null },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
  };
}

/**
 * Adds a media file to the test project. Video and images go on the main
 * track, appended after what is there; audio goes on the audio track at `at`.
 */
export function addMediaToProject(
  project: TimelineProject,
  item: MediaItem,
  options: { at?: number; newId?: IdFn } = {},
): TimelineProject {
  const newId = options.newId ?? createId;
  const type: TrackType = item.kind === "audio" ? "audio" : "video";
  const { project: withTrack, trackId } = ensureTrack(project, type, newId);
  const start = item.kind === "audio" ? (options.at ?? 0) : projectDuration(withTrack);
  return insertClip(withTrack, buildClip(item, trackId, start, newId));
}
