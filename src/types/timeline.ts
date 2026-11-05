import type { Keyframe } from "@/types/keyframe";
import type { PhotoAdjustments } from "@/types/photo-adjustments";
import type { TextAdjustments } from "@/types/text-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";

export type TrackType = "video" | "overlay" | "audio";
export type ClipKind = "video" | "image" | "text" | "audio" | "sticker";

export interface Track {
  id: string;
  type: TrackType;
  /** Top-to-bottom position in the timeline UI: 0 is the top row. */
  order: number;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  solo: boolean;
}

export interface ClipTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface ClipAdjustments {
  photo: PhotoAdjustments | null;
  video: VideoAdjustments | null;
  text: TextAdjustments | null;
}

export type TransitionType = "fade" | "dip" | "slide-left" | "slide-right";

/** How a clip comes in after the clip before it (on the same track); played over that clip's last stretch. */
export interface ClipTransition {
  type: TransitionType;
  /** Seconds. */
  duration: number;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  /** Stable media reference; signed URLs are resolved at load time. */
  mediaId: string;
  /** Full length of the source file in seconds; null for stills and text (unbounded). */
  sourceDuration: number | null;

  /** Position on the timeline, in seconds. */
  start: number;
  /** Trim points in the source media, in source seconds. */
  sourceIn: number;
  sourceOut: number;
  speed: number;
  reversed: boolean;
  /** Carried over from the old editor so the setting round-trips; no timeline effect yet. */
  loop: boolean;

  /** 0-100, as in the existing audio and video panels. */
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;

  transform: ClipTransform;
  adjustments: ClipAdjustments;
  /** `time` is relative to the clip's start, in timeline seconds. */
  keyframes: Keyframe[];

  groupId: string | null;
  /** The transition from the previous clip into this one; absent or null for a plain cut. */
  transition?: ClipTransition | null;
  locked: boolean;
  isPlaceholder: boolean;
}

export interface TimelineProject {
  id: string;
  tracks: Track[];
  clips: Clip[];
}
