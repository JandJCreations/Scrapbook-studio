import { z } from "zod";

import { createId, type IdFn } from "@/lib/timeline/ids";
import { addTrack } from "@/lib/timeline/tracks";
import type { Clip, TimelineProject, Track } from "@/types/timeline";

export const TIMELINE_SCHEMA_VERSION = 1;

export class TimelineDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineDocumentError";
  }
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface TimelineDocument {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  tracks: Track[];
  clips: Clip[];
}

export interface TimelineSnapshot {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  timeline: TimelineDocument;
  frame: FrameSize;
}

// Photo/video/text adjustment shapes are owned by their own types and change
// often; here we only require "an object or null" and trust the editor to
// have written the rest.
const looseObject = z.record(z.string(), z.unknown());

const trackSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["video", "overlay", "audio"]),
  order: z.number(),
  muted: z.boolean(),
  locked: z.boolean(),
  hidden: z.boolean(),
  solo: z.boolean(),
});

const keyframeSchema = z.object({
  id: z.string(),
  time: z.number(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  opacity: z.number(),
});

// Only the constraints that would otherwise cause division by zero, NaN or
// an impossible clip are enforced; bounds the engine already tolerates
// (e.g. sourceOut a hair past sourceDuration) must not brick a project.
const clipSchema = z
  .object({
    id: z.string().min(1),
    trackId: z.string().min(1),
    kind: z.enum(["video", "image", "text", "audio", "sticker"]),
    name: z.string(),
    mediaId: z.string(),
    sourceDuration: z.number().positive().nullable(),
    start: z.number().min(0),
    sourceIn: z.number().min(0),
    sourceOut: z.number(),
    speed: z.number().positive(),
    reversed: z.boolean(),
    loop: z.boolean(),
    volume: z.number(),
    muted: z.boolean(),
    fadeIn: z.number().min(0),
    fadeOut: z.number().min(0),
    transform: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      rotation: z.number(),
      opacity: z.number(),
    }),
    adjustments: z.object({
      photo: looseObject.nullable(),
      video: looseObject.nullable(),
      text: looseObject.nullable(),
    }),
    keyframes: z.array(keyframeSchema),
    groupId: z.string().nullable(),
    locked: z.boolean(),
    isPlaceholder: z.boolean(),
  })
  .refine((clip) => clip.sourceOut > clip.sourceIn, {
    message: "sourceOut must be greater than sourceIn",
    path: ["sourceOut"],
  });

const documentSchema = z.object({
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  tracks: z.array(trackSchema),
  clips: z.array(clipSchema),
});

const frameSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export function serializeTimeline(project: TimelineProject): TimelineDocument {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    tracks: project.tracks,
    clips: project.clips,
  };
}

/** Validates a stored document. Throws TimelineDocumentError; never repairs. */
export function parseTimeline(projectId: string, raw: unknown): TimelineProject {
  const result = documentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    throw new TimelineDocumentError(`Invalid timeline at ${path}: ${issue.message}`);
  }

  const { tracks, clips } = result.data;

  const trackIds = new Set<string>();
  for (const track of tracks) {
    if (trackIds.has(track.id)) {
      throw new TimelineDocumentError(`Duplicate track id "${track.id}"`);
    }
    trackIds.add(track.id);
  }

  const clipIds = new Set<string>();
  for (const clip of clips) {
    if (clipIds.has(clip.id)) {
      throw new TimelineDocumentError(`Duplicate clip id "${clip.id}"`);
    }
    clipIds.add(clip.id);
    if (!trackIds.has(clip.trackId)) {
      throw new TimelineDocumentError(
        `Clip "${clip.id}" references missing track "${clip.trackId}"`,
      );
    }
  }

  return { id: projectId, tracks: tracks as Track[], clips: clips as unknown as Clip[] };
}

/** A brand-new project: one main video track and one audio track. */
export function emptyTimeline(projectId: string, newId: IdFn = createId): TimelineProject {
  const base: TimelineProject = { id: projectId, tracks: [], clips: [] };
  return addTrack(addTrack(base, "video", newId), "audio", newId);
}

export function serializeSnapshot(project: TimelineProject, frame: FrameSize): TimelineSnapshot {
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    timeline: serializeTimeline(project),
    frame,
  };
}

export function parseSnapshot(
  projectId: string,
  raw: unknown,
): { project: TimelineProject; frame: FrameSize } {
  const isCurrent =
    typeof raw === "object" &&
    raw !== null &&
    (raw as { schemaVersion?: unknown }).schemaVersion === TIMELINE_SCHEMA_VERSION;
  if (!isCurrent) {
    throw new TimelineDocumentError(
      "This version was saved by an older editor and can't be restored.",
    );
  }

  const { timeline, frame } = raw as { timeline?: unknown; frame?: unknown };
  const parsedFrame = frameSchema.safeParse(frame);
  if (!parsedFrame.success) {
    throw new TimelineDocumentError("Invalid frame size in saved version");
  }
  return { project: parseTimeline(projectId, timeline), frame: parsedFrame.data };
}
