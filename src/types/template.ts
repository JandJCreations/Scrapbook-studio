import type { TextAdjustments } from "@/types/text-adjustments";

export interface TemplateObjectDef {
  type: "image" | "text";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  src?: string;
  text?: Partial<TextAdjustments>;
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
