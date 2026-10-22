/** The part of an HTMLImageElement the cache uses. */
export interface ImageLike {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  crossOrigin: string | null;
  src: string;
}

export interface ImageCache<I extends ImageLike> {
  /** The loaded image, or null while loading, after a failure, or without a URL. */
  get(mediaId: string): I | null;
  /** Forget a media id (e.g. its URL changed) so the next get loads it again. */
  invalidate(mediaId: string): void;
  dispose(): void;
}

type Entry<I> = { state: "loading" | "failed" | "loaded"; image: I };

export function createImageCache<I extends ImageLike>(options: {
  urlFor(mediaId: string): string | null;
  /** An image finished loading; the owner should redraw. */
  onLoad(): void;
  createImage(): I;
}): ImageCache<I> {
  const entries = new Map<string, Entry<I>>();

  function detach(entry: Entry<I>) {
    entry.image.onload = null;
    entry.image.onerror = null;
  }

  return {
    get(mediaId) {
      const existing = entries.get(mediaId);
      if (existing) return existing.state === "loaded" ? existing.image : null;

      const url = options.urlFor(mediaId);
      if (url === null) return null;

      const image = options.createImage();
      entries.set(mediaId, { state: "loading", image });
      image.onload = () => {
        entries.set(mediaId, { state: "loaded", image });
        options.onLoad();
      };
      image.onerror = () => {
        entries.set(mediaId, { state: "failed", image });
      };
      // Without this, a cross-origin image would taint the canvas.
      image.crossOrigin = "anonymous";
      image.src = url;
      return null;
    },

    invalidate(mediaId) {
      const entry = entries.get(mediaId);
      if (entry) detach(entry);
      entries.delete(mediaId);
    },

    dispose() {
      for (const entry of entries.values()) detach(entry);
      entries.clear();
    },
  };
}
