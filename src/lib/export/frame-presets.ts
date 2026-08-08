export interface FramePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const FRAME_PRESETS: FramePreset[] = [
  { id: "landscape", label: "Landscape (16:9)", width: 1920, height: 1080 },
  { id: "portrait", label: "Portrait (9:16)", width: 1080, height: 1920 },
  { id: "square", label: "Square (1:1)", width: 1080, height: 1080 },
  { id: "classic", label: "Classic (4:3)", width: 1600, height: 1200 },
];

export const DEFAULT_FRAME_PRESET = FRAME_PRESETS[0];
