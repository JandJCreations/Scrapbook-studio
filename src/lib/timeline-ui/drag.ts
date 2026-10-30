import { clipRect, ROW_GAP, type TrackLayout } from "@/lib/timeline-ui/layout";
import { clipDuration } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { findClip, findTrack, isClipLocked } from "@/lib/timeline/lookup";
import { isMagnetic } from "@/lib/timeline/pack";
import { moveClip } from "@/lib/timeline/place";
import {
  collectSnapTargets,
  snapClipStart,
  snapThresholdSeconds,
  snapTime,
} from "@/lib/timeline/snap";
import { addTrack } from "@/lib/timeline/tracks";
import { trimClip, type TrimEdge } from "@/lib/timeline/trim";
import type { TimelineProject } from "@/types/timeline";

export const SNAP_THRESHOLD_PX = 8;
/** The pointer must move this far before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export type DropTarget = { kind: "track"; trackId: string } | { kind: "new-track" };

export interface Guide {
  kind: "snap" | "insert";
  time: number;
}

export interface DragResult {
  project: TimelineProject;
  guide: Guide | null;
}

/** `y` is measured from the top of the tracks area. */
export function dropTargetAt(layout: TrackLayout, y: number): DropTarget {
  const last = layout.rows.length - 1;
  for (let i = 0; i <= last; i++) {
    const row = layout.rows[i];
    const owned = row.height + (i === last ? 0 : ROW_GAP);
    if (y >= row.y && y < row.y + owned) return { kind: "track", trackId: row.trackId };
  }
  return { kind: "new-track" };
}

export interface MoveInput {
  clipId: string;
  /** Timeline time under the pointer. */
  pointerTime: number;
  /** Seconds from the clip's start to where it was grabbed. */
  grabOffset: number;
  target: DropTarget;
  playhead: number;
  pps: number;
  newTrackId?: IdFn;
}

const unchanged = (project: TimelineProject): DragResult => ({ project, guide: null });

export function computeMove(project: TimelineProject, input: MoveInput): DragResult {
  const clip = findClip(project, input.clipId);
  if (!clip || isClipLocked(project, clip)) return unchanged(project);

  const desired = Math.max(0, input.pointerTime - input.grabOffset);
  let working = project;
  let trackId: string;

  if (input.target.kind === "track" && findTrack(project, input.target.trackId)) {
    trackId = input.target.trackId;
  } else {
    // Empty space, or the preview track from an earlier move of this same drag.
    working = addTrack(
      project,
      clip.kind === "audio" ? "audio" : "overlay",
      input.newTrackId ?? createId,
    );
    const created = working.tracks.find((t) => !project.tracks.some((old) => old.id === t.id));
    if (!created) return unchanged(project);
    trackId = created.id;
  }

  const track = findTrack(working, trackId);
  if (!track) return unchanged(project);

  if (isMagnetic(track)) {
    const next = moveClip(working, clip.id, { start: desired, trackId });
    if (next === working) return unchanged(project);
    const landed = findClip(next, clip.id);
    return { project: next, guide: landed ? { kind: "insert", time: landed.start } : null };
  }

  const targets = collectSnapTargets(working, [clip.id], input.playhead);
  const snapped = snapClipStart(
    desired,
    clipDuration(clip),
    targets,
    snapThresholdSeconds(SNAP_THRESHOLD_PX, input.pps),
  );
  const next = moveClip(working, clip.id, { start: snapped.start, trackId });
  if (next === working) return unchanged(project);
  return {
    project: next,
    guide: snapped.snappedTo === null ? null : { kind: "snap", time: snapped.snappedTo },
  };
}

export interface TrimInput {
  clipId: string;
  edge: TrimEdge;
  pointerTime: number;
  playhead: number;
  pps: number;
}

export function computeTrim(project: TimelineProject, input: TrimInput): DragResult {
  const clip = findClip(project, input.clipId);
  if (!clip || isClipLocked(project, clip)) return unchanged(project);

  const targets = collectSnapTargets(project, [clip.id], input.playhead);
  const snapped = snapTime(
    input.pointerTime,
    targets,
    snapThresholdSeconds(SNAP_THRESHOLD_PX, input.pps),
  );
  const next = trimClip(project, clip.id, input.edge, snapped.time);
  if (next === project) return unchanged(project);
  return {
    project: next,
    guide: snapped.snappedTo === null ? null : { kind: "snap", time: snapped.snappedTo },
  };
}

/** Ids of clips whose chip overlaps the rectangle (lane coordinates; touching edges do not count). */
export function clipsInRect(
  project: TimelineProject,
  layout: TrackLayout,
  pps: number,
  rect: { left: number; top: number; right: number; bottom: number },
): string[] {
  const rows = new Map(layout.rows.map((row) => [row.trackId, row]));
  const ids: string[] = [];
  for (const clip of project.clips) {
    const row = rows.get(clip.trackId);
    if (!row) continue;
    const box = clipRect(clip, row, pps);
    if (
      box.x < rect.right &&
      box.x + box.width > rect.left &&
      box.y < rect.bottom &&
      box.y + box.height > rect.top
    ) {
      ids.push(clip.id);
    }
  }
  return ids;
}
