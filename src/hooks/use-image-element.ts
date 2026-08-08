import * as React from "react";

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
