import type { CropRect } from "@/types/photo-adjustments";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export const CROP_ASPECTS: Array<{ id: string; label: string; ratio: number | null }> = [
  { id: "original", label: "Original", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
];

export interface CropControls {
  /** A CROP_ASPECTS id, or "free" for a shape that is none of them. */
  aspect: string;
  zoom: number;
  /** 0 to 100: where the crop sits in the room the zoom leaves. */
  panX: number;
  panY: number;
}

interface Size {
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The biggest rectangle of this shape that fits inside the picture. */
function largest(natural: Size, ratio: number): Size {
  return natural.width / natural.height > ratio
    ? { width: natural.height * ratio, height: natural.height }
    : { width: natural.width, height: natural.width / ratio };
}

/** The crop for an aspect shape (null: the picture's own), a zoom and a position; in the picture's own pixels. */
export function cropFor(
  natural: Size,
  ratio: number | null,
  zoom: number,
  panX: number,
  panY: number,
): CropRect {
  const base = largest(natural, ratio ?? natural.width / natural.height);
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const width = Math.round(base.width / z);
  const height = Math.round(base.height / z);
  return {
    x: Math.round((natural.width - width) * (clamp(panX, 0, 100) / 100)),
    y: Math.round((natural.height - height) * (clamp(panY, 0, 100) / 100)),
    width,
    height,
  };
}

/** What the crop controls should show for an existing crop. */
export function controlsFromCrop(natural: Size, crop: CropRect | null): CropControls {
  if (!crop) return { aspect: "original", zoom: 1, panX: 50, panY: 50 };
  const ratio = crop.width / crop.height;
  const preset = CROP_ASPECTS.find(
    (a) => a.ratio !== null && Math.abs(a.ratio - ratio) < 0.02,
  );
  const isOriginal = Math.abs(natural.width / natural.height - ratio) < 0.02;
  const base = largest(natural, ratio);
  const slackX = natural.width - crop.width;
  const slackY = natural.height - crop.height;
  return {
    aspect: isOriginal ? "original" : (preset?.id ?? "free"),
    zoom: clamp(base.width / crop.width, MIN_ZOOM, MAX_ZOOM),
    panX: slackX > 0 ? (crop.x / slackX) * 100 : 50,
    panY: slackY > 0 ? (crop.y / slackY) * 100 : 50,
  };
}
