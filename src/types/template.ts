import type {
  AnimationInType,
  AnimationOutType,
  AnimationSpec,
  BackgroundSpec,
  MotionType,
  TransitionSpec,
} from "@/types/object-extras";
import type { TextAdjustments } from "@/types/text-adjustments";

export interface TemplateObjectDef {
  type: "image" | "video" | "text";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  src?: string;
  text?: Partial<TextAdjustments>;
  // An empty "tap to add" slot the user fills with their own photo/video,
  // instead of pre-placed decorative content. Only valid for image/video.
  placeholder?: boolean;

  // Video-template extras (all optional).
  /** A slot on the story track (fills the frame, plays in order). */
  story?: boolean;
  /** Seconds on screen: a story slot's length, or with `startTime` a title's. */
  duration?: number;
  /** When a non-story object appears (seconds). Negative = from the end of the story. */
  startTime?: number;
  transitionIn?: TransitionSpec;
  animIn?: AnimationSpec<AnimationInType>;
  animOut?: AnimationSpec<AnimationOutType>;
  motion?: MotionType;
}

export interface ScrapbookTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  frame: { width: number; height: number };
  swatch: string;
  objects: TemplateObjectDef[];
  /** Page background. */
  background?: BackgroundSpec;
  /** A song from the built-in music library (by id) added under the story. */
  musicId?: string;
}
