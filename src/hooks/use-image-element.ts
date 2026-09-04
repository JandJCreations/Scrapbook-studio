import * as React from "react";

// Phone photos are commonly 3000-4000px+ and several MB each. Decoding them
// at full resolution just to render them on-screen (often at a few hundred
// px) is what was crashing the editor on mobile once more than a couple were
// placed on the canvas at once. createImageBitmap's resize option lets the
// browser decode directly to a smaller target instead of decoding the full
// image and then downscaling it, which keeps peak memory far lower.
//
// Trade-off: export captures whatever is currently drawn on the Konva stage
// (see capture-frame.ts), so this also caps how much detail an export can
// contain. A crashing editor is a worse outcome than a capped export
// resolution, so this is deliberately biased toward not crashing.
const MAX_EDIT_DIMENSION = 2200;

export function useImageElement(src: string) {
  const [image, setImage] = React.useState<ImageBitmap | HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (!src) return;

    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    let img: HTMLImageElement | null = null;

    function loadPlainImage() {
      img = new window.Image();
      img.src = src;
      img.onload = () => {
        if (!cancelled) setImage(img);
      };
    }

    async function load() {
      if (typeof createImageBitmap !== "function") {
        loadPlainImage();
        return;
      }
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        if (cancelled) return;
        bitmap = await createImageBitmap(blob, {
          resizeWidth: MAX_EDIT_DIMENSION,
          resizeQuality: "medium",
        });
        if (cancelled) {
          bitmap.close();
          return;
        }
        setImage(bitmap);
      } catch {
        if (!cancelled) loadPlainImage();
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (img) img.onload = null;
      bitmap?.close();
    };
  }, [src]);

  return src ? image : null;
}
