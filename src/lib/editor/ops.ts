import { fitContain } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { insertClip } from "@/lib/timeline/place";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, ClipTransform, TimelineProject, TrackType } from "@/types/timeline";

export const STILL_SECONDS = 5;
export const OVERLAY_SCALE = 0.4;

export interface EditorMedia {
  mediaId: string;
  name: string;
  kind: "video" | "image" | "audio";
  /** Seconds; 0 for images. */
  duration: number;
  /** Natural size in pixels; 0 when unknown. */
  width: number;
  height: number;
}

export interface AddResult {
  project: TimelineProject;
  clipId: string;
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

function buildClip(
  media: EditorMedia,
  trackId: string,
  start: number,
  transform: ClipTransform,
  newId: IdFn,
): Clip {
  const still = media.kind === "image";
  return {
    id: newId(),
    trackId,
    kind: media.kind,
    name: media.name,
    mediaId: media.mediaId,
    sourceDuration: still ? null : media.duration,
    start,
    sourceIn: 0,
    sourceOut: still ? STILL_SECONDS : media.duration,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform,
    adjustments: { photo: null, video: null, text: null },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
  };
}

export function addAudioClip(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  const { project: withTrack, trackId } = ensureTrack(project, "audio", newId);
  const clip = buildClip(
    media,
    trackId,
    Math.max(0, at),
    { x: 0, y: 0, width: frame.width, height: frame.height, rotation: 0, opacity: 1 },
    newId,
  );
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Appends a photo or video to the end of the main sequence, fitted inside the frame. */
export function addToSequence(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  newId: IdFn = createId,
): AddResult {
  if (media.kind === "audio") return addAudioClip(project, media, frame, 0, newId);
  const { project: withTrack, trackId } = ensureTrack(project, "video", newId);
  const end = clipsOnTrack(withTrack, trackId).reduce(
    (latest, clip) => Math.max(latest, clipEnd(clip)),
    0,
  );
  const box = fitContain(media.width, media.height, frame.width, frame.height);
  const clip = buildClip(media, trackId, end, { ...box, rotation: 0, opacity: 1 }, newId);
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Puts a photo or video on its own new overlay track on top, small and centred (a collage piece). */
export function addAsOverlay(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  if (media.kind === "audio") return addAudioClip(project, media, frame, at, newId);
  const withTrack = addTrack(project, "overlay", newId);
  const created = withTrack.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");

  const box = fitContain(
    media.width,
    media.height,
    frame.width * OVERLAY_SCALE,
    frame.height * OVERLAY_SCALE,
  );
  const transform: ClipTransform = {
    x: (frame.width - box.width) / 2,
    y: (frame.height - box.height) / 2,
    width: box.width,
    height: box.height,
    rotation: 0,
    opacity: 1,
  };
  const clip = buildClip(media, created.id, Math.max(0, at), transform, newId);
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Applies a position/size/rotation patch to each listed clip. Locked, unknown or unchanged clips are left alone. */
export function setClipTransforms(
  project: TimelineProject,
  patches: Record<string, Partial<ClipTransform>>,
): TimelineProject {
  let result = project;
  for (const [clipId, patch] of Object.entries(patches)) {
    const clip = result.clips.find((c) => c.id === clipId);
    if (!clip) continue;
    const keys = Object.keys(patch) as (keyof ClipTransform)[];
    if (keys.every((key) => patch[key] === undefined || Object.is(patch[key], clip.transform[key]))) {
      continue;
    }
    result = updateClip(result, clipId, { transform: { ...clip.transform, ...patch } });
  }
  return result;
}
