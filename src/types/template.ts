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
}

export interface ScrapbookTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  frame: { width: number; height: number };
  swatch: string;
  objects: TemplateObjectDef[];
}
