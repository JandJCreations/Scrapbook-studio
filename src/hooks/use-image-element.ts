import * as React from "react";

// This intentionally does NOT resize/downscale via createImageBitmap. That
// was tried to cut canvas memory pressure on mobile, but createImageBitmap
// with an HTMLImageElement source has a history of inconsistent support in
// Safari specifically, and after it shipped the canvas started being
// reported blank — plausibly a silent failure path this hook's plain <img>
// approach doesn't have. The canvas' actual crash cause (confirmed
// separately) was an unrelated paused backend, not full-resolution image
// loading, so there's no longer a confirmed reason to accept that risk here.
// Mobile canvas performance is instead handled by capping the Konva stage's
// pixelRatio (see canvas-stage.tsx) and by not loading full-resolution
// images for grid thumbnails (see use-media-store.ts) — neither changes how
// an object actually renders on the canvas.
export function useImageElement(src: string) {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const img = new window.Image();
    img.src = src;
    img.onload = () => {
      if (!cancelled) setImage(img);
    };

    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [src]);

  return src ? image : null;
}
