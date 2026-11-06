import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import type { MediaItem } from "@/types/media";

/** Whether an item can go in the video now: uploaded, or still uploading but already on this computer. A failed one cannot. */
export function isUsable(item: MediaItem): boolean {
  if (item.status === "ready") return true;
  return item.status === "processing" && item.localUrl !== undefined;
}

/** The files this computer is holding for the editor (picked but perhaps not uploaded yet). */
export interface LocalFiles {
  urlFor(id: string): string | null;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
}

/**
 * A media source that plays a file from this computer whenever it has one (no
 * waiting on the upload or the network) and otherwise asks the stored copy.
 */
export function withLocalFiles(source: MediaUrlSource, local: LocalFiles): MediaUrlSource {
  return {
    urlFor: (id) => local.urlFor(id) ?? source.urlFor(id),
    posterFor: (id) => source.posterFor(id),
    ensure: (ids) => source.ensure(ids.filter((id) => local.urlFor(id) === null)),
    subscribe(listener) {
      const stopSource = source.subscribe(listener);
      const stopLocal = local.subscribe(listener);
      return () => {
        stopSource();
        stopLocal();
      };
    },
    getVersion: () => source.getVersion() + local.getVersion(),
  };
}
