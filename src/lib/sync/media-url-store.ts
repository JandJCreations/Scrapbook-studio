import { isStorageMediaId, resolveMediaUrls, type MediaUrlDeps } from "@/lib/sync/media-urls";

export interface MediaUrlSource {
  urlFor(mediaId: string): string | null;
  posterFor(mediaId: string): string | null;
  /** Resolves signed URLs for ids that are missing or about to expire. Never rejects. */
  ensure(ids: string[]): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** Changes whenever new URLs arrive; the snapshot for useSyncExternalStore. */
  getVersion(): number;
}

export interface MediaUrlStore extends MediaUrlSource {
  dispose(): void;
}

const DEFAULT_TTL_MS = 20 * 60 * 60 * 1000; // signed URLs last 24 hours; refresh well before
const DEFAULT_RETRY_AFTER_MS = 15_000;

interface Entry {
  url: string;
  posterUrl: string | null;
  expiresAt: number;
}

export function createMediaUrlStore(options: {
  deps: MediaUrlDeps;
  /** Injected clock, e.g. Date.now. */
  now: () => number;
  ttlMs?: number;
  retryAfterMs?: number;
}): MediaUrlStore {
  const { now } = options;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<void>>();
  const failedAt = new Map<string, number>();
  const listeners = new Set<() => void>();
  let version = 0;
  let disposed = false;

  const fresh = (id: string) => {
    const entry = entries.get(id);
    return entry !== undefined && entry.expiresAt > now();
  };
  const recentlyFailed = (id: string) => {
    const at = failedAt.get(id);
    return at !== undefined && now() - at < retryAfterMs;
  };

  return {
    urlFor: (id) => entries.get(id)?.url ?? null,
    posterFor: (id) => entries.get(id)?.posterUrl ?? null,

    async ensure(ids) {
      if (disposed) return;
      const wanted = Array.from(new Set(ids.filter(isStorageMediaId)));
      const need = wanted.filter((id) => !fresh(id) && !inflight.has(id) && !recentlyFailed(id));

      if (need.length > 0) {
        const request = resolveMediaUrls(need, options.deps).then(
          (resolved) => {
            if (disposed) return;
            for (const id of need) {
              const result = resolved.get(id);
              if (result) {
                entries.set(id, {
                  url: result.url,
                  posterUrl: result.posterUrl,
                  expiresAt: now() + ttlMs,
                });
                failedAt.delete(id);
              } else {
                failedAt.set(id, now());
              }
            }
            if (resolved.size > 0) {
              version += 1;
              for (const listener of Array.from(listeners)) listener();
            }
          },
          () => {
            if (disposed) return;
            for (const id of need) failedAt.set(id, now());
          },
        );
        for (const id of need) inflight.set(id, request);
        void request.finally(() => {
          for (const id of need) if (inflight.get(id) === request) inflight.delete(id);
        });
      }

      await Promise.all(
        wanted.map((id) => inflight.get(id)).filter((p): p is Promise<void> => p !== undefined),
      );
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getVersion: () => version,

    dispose() {
      disposed = true;
      listeners.clear();
      entries.clear();
      inflight.clear();
    },
  };
}
