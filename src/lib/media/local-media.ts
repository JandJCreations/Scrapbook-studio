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

/** The part of the media store (zustand) that the local files need. */
interface ItemsStore {
  getState(): { items: MediaItem[] };
  subscribe(listener: () => void): () => void;
}

/**
 * The files this computer is holding, read from the media store. The store
 * changes on every upload progress tick, so listeners hear only when a local
 * file appears or goes away. One watch of the store serves every listener.
 */
export function createStoreLocalFiles(store: ItemsStore): LocalFiles {
  const keyOf = () =>
    store
      .getState()
      .items.filter((item) => item.localUrl !== undefined)
      .map((item) => item.id + "=" + item.localUrl)
      .join("|");
  const listeners = new Set<() => void>();
  let version = 0;
  let key = "";
  let stopWatching: (() => void) | null = null;

  return {
    urlFor: (id) => store.getState().items.find((item) => item.id === id)?.localUrl ?? null,
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener);
      if (!stopWatching) {
        key = keyOf();
        stopWatching = store.subscribe(() => {
          const next = keyOf();
          if (next === key) return;
          key = next;
          version += 1;
          for (const fn of Array.from(listeners)) fn();
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopWatching?.();
          stopWatching = null;
        }
      };
    },
  };
}
