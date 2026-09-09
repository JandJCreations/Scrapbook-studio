import * as React from "react";

// Phone photos are commonly 3000-4000px+ and several MB each. Decoding them
// at full resolution just to render them on-screen (often at a few hundred
// px) is what was crashing the editor on mobile once more than a couple were
// placed on the canvas at once. createImageBitmap's resize option produces a
// much smaller in-memory bitmap for Konva to hold and redraw from than a
// full-size <img>, cutting ongoing (not just initial) memory pressure.
//
// Loads through a plain <img> first (exactly like before this change) rather
// than fetch()+blob(), since fetch requires the response to carry CORS
// headers while an <img> doesn't — this keeps the same loading behavior this
// app already relied on and only adds the resize step on top of it.
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
    const img = new window.Image();

    img.onload = () => {
      if (cancelled) return;

      // Only worth resizing down if the source is actually bigger than the
      // cap — stickers, small uploads, and other already-small sources would
      // otherwise get force-upscaled to 2200px for no benefit (wasted memory
      // for raster sources, unnecessary work for vector ones).
      if (typeof createImageBitmap !== "function" || img.naturalWidth <= MAX_EDIT_DIMENSION) {
        setImage(img);
        return;
      }

      createImageBitmap(img, { resizeWidth: MAX_EDIT_DIMENSION, resizeQuality: "medium" })
        .then((result) => {
          if (cancelled) {
            result.close();
            return;
          }
          bitmap = result;
          setImage(result);
        })
        .catch(() => {
          if (!cancelled) setImage(img);
        });
    };

    img.src = src;

    return () => {
      cancelled = true;
      img.onload = null;
      bitmap?.close();
    };
  }, [src]);

  return src ? image : null;
}
