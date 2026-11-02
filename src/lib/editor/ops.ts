import { fitContain } from "@/lib/playback/scene";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { clipDuration, clipEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { clipsOnTrack } from "@/lib/timeline/lookup";
import { insertClip } from "@/lib/timeline/place";
import { trimClip } from "@/lib/timeline/trim";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, ClipTransform, TimelineProject, TrackType } from "@/types/timeline";
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  type CropRect,
  type PhotoAdjustments,
} from "@/types/photo-adjustments";
import { DEFAULT_TEXT_ADJUSTMENTS, type TextAdjustments } from "@/types/text-adjustments";
import { createDefaultVideoAdjustments, type VideoAdjustments } from "@/types/video-adjustments";

export const STILL_SECONDS = 5;
export const OVERLAY_SCALE = 0.4;
export const TEXT_SECONDS = 5;
const TEXT_WIDTH_SCALE = 0.6;
const TEXT_FONT_SCALE = 0.07;
const TEXT_NAME_LENGTH = 24;

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

function textName(content: string): string {
  const trimmed = content.trim();
  return trimmed === "" ? "Text" : trimmed.slice(0, TEXT_NAME_LENGTH);
}

/** The default text style: white (frames start black), with the font sized for the frame. */
function defaultTextFor(frame: FrameSize, content: string): TextAdjustments {
  return {
    ...DEFAULT_TEXT_ADJUSTMENTS,
    color: "#ffffff",
    content,
    fontSize: Math.round(frame.height * TEXT_FONT_SCALE),
  };
}

/** Adds a text clip on its own new top overlay track, centred in the frame, at the playhead. */
export function addText(
  project: TimelineProject,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  const withTrack = addTrack(project, "overlay", newId);
  const created = withTrack.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");

  const text = defaultTextFor(frame, "Your text");
  const width = frame.width * TEXT_WIDTH_SCALE;
  const height = text.fontSize * text.lineHeight * 2;
  const clip: Clip = {
    id: newId(),
    trackId: created.id,
    kind: "text",
    name: textName(text.content),
    mediaId: "",
    sourceDuration: null,
    start: Math.max(0, at),
    sourceIn: 0,
    sourceOut: TEXT_SECONDS,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: {
      x: (frame.width - width) / 2,
      y: (frame.height - height) / 2,
      width,
      height,
      rotation: 0,
      opacity: 1,
    },
    adjustments: { photo: null, video: null, text },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
  };
  return { project: insertClip(withTrack, clip), clipId: clip.id };
}

/** Merges a patch into a text clip's style and keeps the clip name in step with its words. */
export function patchTextAdjustments(
  project: TimelineProject,
  clipId: string,
  patch: Partial<TextAdjustments>,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  const current = clip?.adjustments.text;
  if (!clip || clip.kind !== "text" || !current) return project;
  const next: TextAdjustments = { ...current, ...patch };
  if (JSON.stringify(next) === JSON.stringify(current)) return project;
  return updateClip(project, clipId, {
    name: textName(next.content),
    adjustments: { ...clip.adjustments, text: next },
  });
}

/** Puts the style back to the default for this frame, keeping the words. */
export function resetTextAdjustments(
  project: TimelineProject,
  clipId: string,
  frame: FrameSize,
): TimelineProject {
  const current = project.clips.find((c) => c.id === clipId)?.adjustments.text;
  if (!current) return project;
  return patchTextAdjustments(project, clipId, defaultTextFor(frame, current.content));
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

/** Sets how see-through a clip is (0 to 1). */
export function setClipOpacity(project: TimelineProject, clipId: string, opacity: number): TimelineProject {
  return setClipTransforms(project, { [clipId]: { opacity: Math.min(1, Math.max(0, opacity)) } });
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

/**
 * Crops a picture or video to a rectangle of the file's own pixels (null clears
 * it), and reshapes the clip's box to the crop, keeping its width and centre, so
 * nothing is stretched. `natural` is the file's full size in pixels.
 */
export function setCrop(
  project: TimelineProject,
  clipId: string,
  crop: CropRect | null,
  natural: { width: number; height: number },
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || (clip.kind !== "image" && clip.kind !== "video")) return project;
  if (crop && !(crop.width > 0 && crop.height > 0)) return project;

  const changed =
    clip.kind === "image"
      ? patchPhotoAdjustments(project, clipId, { crop })
      : patchVideoAdjustments(project, clipId, { crop });
  if (changed === project) return project;

  const aspect = crop ? crop.width / crop.height : natural.width / natural.height;
  if (!(aspect > 0) || !Number.isFinite(aspect)) return changed;
  const { width, height, y } = clip.transform;
  const nextHeight = width / aspect;
  return setClipTransforms(changed, {
    [clipId]: { height: nextHeight, y: y + (height - nextHeight) / 2 },
  });
}

export const STICKER_SECONDS = 5;
const STICKER_FRAME_SCALE = 0.3;

/** A picture to place as a sticker: the id a clip stores for it, its name and its own shape. */
export interface StickerArt {
  mediaId: string;
  name: string;
  width: number;
  height: number;
}

/** Adds a sticker on its own new top overlay track, fitted inside 30% of the frame and centred, at the playhead. */
export function addSticker(
  project: TimelineProject,
  art: StickerArt,
  frame: FrameSize,
  at: number,
  newId: IdFn = createId,
): AddResult {
  const withTrack = addTrack(project, "overlay", newId);
  const created = withTrack.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");

  const box = fitContain(art.width, art.height, frame.width * STICKER_FRAME_SCALE, frame.height * STICKER_FRAME_SCALE);
  const clip = buildClip(
    { mediaId: art.mediaId, name: art.name, kind: "image", duration: 0, width: art.width, height: art.height },
    created.id,
    Math.max(0, at),
    {
      x: (frame.width - box.width) / 2,
      y: (frame.height - box.height) / 2,
      width: box.width,
      height: box.height,
      rotation: 0,
      opacity: 1,
    },
    newId,
  );
  const sticker: Clip = { ...clip, kind: "sticker", sourceOut: STICKER_SECONDS };
  return { project: insertClip(withTrack, sticker), clipId: sticker.id };
}

export interface PlaceholderBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Adds an empty "tap to add" slot (a picture clip with no media) on its own new top overlay track. */
export function addPlaceholder(
  project: TimelineProject,
  name: string,
  box: PlaceholderBox,
  at: number,
  newId: IdFn = createId,
): AddResult {
  const withTrack = addTrack(project, "overlay", newId);
  const created = withTrack.tracks.find((track) => !project.tracks.some((old) => old.id === track.id));
  if (!created) throw new Error("addTrack did not add a track");
  const clip = buildClip(
    { mediaId: "", name, kind: "image", duration: 0, width: 0, height: 0 },
    created.id,
    Math.max(0, at),
    { ...box, opacity: 1 },
    newId,
  );
  const slot: Clip = { ...clip, isPlaceholder: true };
  return { project: insertClip(withTrack, slot), clipId: slot.id };
}

/**
 * Puts a picture or video into an empty slot. It keeps the slot's place and
 * tilt: the media is fitted inside the slot's box and centred, and the clip
 * becomes an ordinary picture or video clip (5 s, or the video's own length).
 */
export function fillPlaceholder(
  project: TimelineProject,
  clipId: string,
  media: EditorMedia,
): TimelineProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || !clip.isPlaceholder || clip.locked || media.kind === "audio") return project;
  const track = project.tracks.find((t) => t.id === clip.trackId);
  if (!track || track.locked) return project;

  const box = clip.transform;
  const fit = fitContain(media.width, media.height, box.width, box.height);
  // The box turns about its top-left corner, so its own offsets are turned with it.
  const angle = (box.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const still = media.kind === "image";
  // The slot sits among clips that last as long as it does: the picture or video
  // lasts no longer (trimming can stretch a video back out to its full length).
  const slotLength = clipDuration(clip);
  const filled: Clip = {
    ...clip,
    kind: media.kind,
    name: media.name,
    mediaId: media.mediaId,
    sourceDuration: still ? null : media.duration,
    sourceIn: 0,
    sourceOut: still ? slotLength : Math.min(media.duration, slotLength),
    isPlaceholder: false,
    transform: {
      ...box,
      x: box.x + fit.x * cos - fit.y * sin,
      y: box.y + fit.x * sin + fit.y * cos,
      width: fit.width,
      height: fit.height,
    },
  };
  return { ...project, clips: project.clips.map((c) => (c.id === clipId ? filled : c)) };
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
