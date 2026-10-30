export interface WaveformService {
  /** The cached peaks, or null (and one load starts) when they are not there yet. */
  get(mediaId: string): number[] | null;
  failed(mediaId: string): boolean;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  invalidate(mediaId: string): void;
  dispose(): void;
}

export function createWaveformService(options: {
  urlFor(mediaId: string): string | null;
  loadPeaks(url: string): Promise<number[]>;
}): WaveformService {
  const peaks = new Map<string, number[]>();
  const loading = new Set<string>();
  const failedIds = new Set<string>();
  const listeners = new Set<() => void>();
  let version = 0;
  let disposed = false;

  return {
    get(mediaId) {
      if (disposed) return null;
      const cached = peaks.get(mediaId);
      if (cached) return cached;
      if (loading.has(mediaId) || failedIds.has(mediaId)) return null;
      const url = options.urlFor(mediaId);
      if (url === null) return null;

      loading.add(mediaId);
      options.loadPeaks(url).then(
        (result) => {
          if (disposed || !loading.delete(mediaId)) return;
          peaks.set(mediaId, result);
          version += 1;
          for (const listener of Array.from(listeners)) listener();
        },
        () => {
          if (disposed || !loading.delete(mediaId)) return;
          failedIds.add(mediaId);
        },
      );
      return null;
    },

    failed: (mediaId) => failedIds.has(mediaId),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getVersion: () => version,

    invalidate(mediaId) {
      peaks.delete(mediaId);
      loading.delete(mediaId);
      failedIds.delete(mediaId);
    },

    dispose() {
      disposed = true;
      peaks.clear();
      loading.clear();
      listeners.clear();
    },
  };
}
