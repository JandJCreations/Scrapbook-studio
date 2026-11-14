import { fitContain } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipDuration, clipEnd, videoEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { isMagnetic, packClips, replaceTrackClips } from "@/lib/timeline/pack";
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
  // The voiceover lane is for narration only: music and other audio go on an ordinary audio track.
  const existing = project.tracks.find((track) => track.type === type && track.role !== "voiceover");
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

/** Puts a recorded voiceover on the voiceover lane (made if needed) at `at`, never trimmed to the video. */
export function addVoiceoverClip(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  let withTrack = project;
  let track = project.tracks.find((t) => t.type === "audio" && t.role === "voiceover");
  if (!track) {
    const added = addTrack(project, "audio", newId);
    const created = added.tracks.find((t) => !project.tracks.some((old) => old.id === t.id));
    if (!created) throw new Error("addTrack did not add a track");
    track = { ...created, role: "voiceover", duckOthers: true };
    withTrack = { ...added, tracks: added.tracks.map((t) => (t.id === created.id ? track! : t)) };
  }
  const clip = buildClip(
    media,
    track.id,
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

/**
 * Like addToSequence, but the clip goes where it was dropped on the strip (a
 * time in seconds): before, between or after the clips already there.
 */
export function addToSequenceAt(
  project: TimelineProject,
  media: EditorMedia,
  frame: FrameSize,
  time: number,
  newId: IdFn = createId,
): AddResult {
  const added = addToSequence(project, media, frame, newId);
  if (media.kind === "audio") return added;
  const clip = added.project.clips.find((c) => c.id === added.clipId);
  if (!clip) return added;
  // After every clip whose middle is before the drop, then pack the strip.
  const others = clipsOnTrack(added.project, clip.trackId).filter((c) => c.id !== clip.id);
  const index = others.filter((c) => c.start + clipDuration(c) / 2 < time).length;
  const ordered = [...others.slice(0, index), clip, ...others.slice(index)];
  return { project: replaceTrackClips(added.project, clip.trackId, packClips(ordered)), clipId: added.clipId };
}

/**
 * Gives every photo the same length. The main strip closes up around the
 * changes; videos and music are left alone. The same project comes back when
 * every photo already has that length.
 */
export function setAllStillDurations(project: TimelineProject, seconds: number): TimelineProject {
  let result = project;
  // In order, so each photo's start is where the strip has already put it.
  // Only the main strip: photos on free tracks are placed by hand, and a new length could overlap their neighbours.
  const magneticTracks = new Set(project.tracks.filter(isMagnetic).map((track) => track.id));
  const stills = project.clips
    .filter((clip) => clip.kind === "image" && magneticTracks.has(clip.trackId))
    .sort((a, b) => a.start - b.start);
  for (const still of stills) {
    const current = result.clips.find((clip) => clip.id === still.id);
    if (!current) continue;
    result = trimClip(result, current.id, "end", current.start + seconds);
  }
  return result;
}

/** Where music starts: at the playhead while it is inside the video, otherwise at the beginning (a song added at the very end would play after the pictures). */
export function musicStartTime(project: TimelineProject, playhead: number): number {
  return playhead < videoEnd(project) ? Math.max(0, playhead) : 0;
}

/**
 * Cuts a song at the end of the video, so a long song does not stretch a short
 * slideshow with black. A song already shorter than the video (or no video yet) is left as it is.
 */
export function fitMusicToVideo(project: TimelineProject, clipId: string): TimelineProject {
  const song = project.clips.find((clip) => clip.id === clipId);
  if (!song) return project;
  const end = videoEnd(project);
  if (end <= song.start || clipEnd(song) <= end) return project;
  return trimClip(project, clipId, "end", end);
}
