import { fitContain } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { insertClip } from "@/lib/timeline/place";
import { trimClip } from "@/lib/timeline/trim";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, ClipTransform, TimelineProject, TrackType } from "@/types/timeline";
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  type PhotoAdjustments,
} from "@/types/photo-adjustments";
import { createDefaultVideoAdjustments, type VideoAdjustments } from "@/types/video-adjustments";

export const STILL_SECONDS = 5;

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

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Changes a picture's look. The first change starts from the default adjustments. */
export function patchPhotoAdjustments(
  project: TimelineProject,
  clipId: string,
  patch: Partial<PhotoAdjustments>,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || clip.kind !== "image") return project;
  const base = clip.adjustments.photo ?? DEFAULT_PHOTO_ADJUSTMENTS;
  const next: PhotoAdjustments = { ...base, ...patch };
  if (sameValue(next, base)) return project;
  return updateClip(project, clipId, { adjustments: { ...clip.adjustments, photo: next } });
}

/** Changes a video's look. The first change starts from the default adjustments. */
export function patchVideoAdjustments(
  project: TimelineProject,
  clipId: string,
  patch: Partial<VideoAdjustments>,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || clip.kind !== "video") return project;
  const base = clip.adjustments.video ?? createDefaultVideoAdjustments(clip.sourceDuration ?? 0);
  const next: VideoAdjustments = { ...base, ...patch };
  if (sameValue(next, base)) return project;
  return updateClip(project, clipId, { adjustments: { ...clip.adjustments, video: next } });
}

/** Volume, mute and fades for clips that carry sound (video and audio). */
export function patchAudio(
  project: TimelineProject,
  clipId: string,
  patch: { volume?: number; muted?: boolean; fadeIn?: number; fadeOut?: number },
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return project;
  return updateClip(project, clipId, patch);
}

/** Fade in and out for any clip (a picture fades its opacity, sound fades its volume). */
export function patchFades(
  project: TimelineProject,
  clipId: string,
  patch: { fadeIn?: number; fadeOut?: number },
): TimelineProject {
  if (!project.clips.some((c) => c.id === clipId)) return project;
  return updateClip(project, clipId, patch);
}

/** Where music starts: at the playhead while it is inside the video, otherwise at the beginning (a song added at the very end would play after the pictures). */
export function musicStartTime(project: TimelineProject, playhead: number): number {
  const videoEnd = project.clips
    .filter((clip) => clip.kind !== "audio")
    .reduce((latest, clip) => Math.max(latest, clipEnd(clip)), 0);
  return playhead < videoEnd ? Math.max(0, playhead) : 0;
}

/**
 * Cuts a song at the end of the video, so a long song does not stretch a short
 * slideshow with black. A song already shorter than the video (or no video yet) is left as it is.
 */
export function fitMusicToVideo(project: TimelineProject, clipId: string): TimelineProject {
  const song = project.clips.find((clip) => clip.id === clipId);
  if (!song) return project;
  const videoEnd = project.clips
    .filter((clip) => clip.kind !== "audio")
    .reduce((latest, clip) => Math.max(latest, clipEnd(clip)), 0);
  if (videoEnd <= song.start || clipEnd(song) <= videoEnd) return project;
  return trimClip(project, clipId, "end", videoEnd);
}
