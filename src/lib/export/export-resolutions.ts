export interface ResolutionPreset {
  id: string;
  label: string;
  maxDimension: number;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: "720p", label: "720p", maxDimension: 1280 },
  { id: "1080p", label: "1080p", maxDimension: 1920 },
  { id: "2k", label: "2K", maxDimension: 2560 },
  { id: "4k", label: "4K", maxDimension: 3840 },
];

export function resolveTargetSize(
  frame: { width: number; height: number },
  preset: ResolutionPreset,
): { width: number; height: number } {
  const scale = preset.maxDimension / Math.max(frame.width, frame.height);
  return {
    width: Math.round(frame.width * scale),
    height: Math.round(frame.height * scale),
  };
}
