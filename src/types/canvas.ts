import type { Keyframe } from "@/types/keyframe";
import type { PhotoAdjustments } from "@/types/photo-adjustments";
import type { TextAdjustments } from "@/types/text-adjustments";
import type { VideoAdjustments } from "@/types/video-adjustments";

export type CanvasObjectType = "image" | "video" | "text";

export interface CanvasObject {
  id: string;
  type: CanvasObjectType;
  name: string;
  mediaId: string;
  src: string;
  videoSrc: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  groupId: string | null;
  adjustments: PhotoAdjustments | null;
  videoAdjustments: VideoAdjustments | null;
  textAdjustments: TextAdjustments | null;

  startTime: number;
  endTime: number;
  fadeIn: number;
  fadeOut: number;
  keyframes: Keyframe[];
}
