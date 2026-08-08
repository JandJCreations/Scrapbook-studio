export type ExportFormat = "png" | "jpg" | "pdf" | "gif" | "mp4" | "mov" | "webm";

export const FORMAT_GROUPS: { label: string; formats: ExportFormat[] }[] = [
  { label: "Image", formats: ["png", "jpg", "pdf"] },
  { label: "Video / animation", formats: ["gif", "mp4", "mov", "webm"] },
];

export const ANIMATED_FORMATS: ExportFormat[] = ["gif", "mp4", "mov", "webm"];
export const TRANSPARENCY_SUPPORTED_FORMATS: ExportFormat[] = ["png", "gif", "webm"];
