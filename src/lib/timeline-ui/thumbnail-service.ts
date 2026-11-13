import { quantizeTime } from "@/lib/timeline-ui/visuals";

export interface FrameExtractor {
  /** Resolves with an image URL (normally a data URL) for the frame at `time`. */
  frame(url: string, time: number): Promise<string>;
  dispose(): void;
}

export interface ThumbnailService {
  /** The cached frame, or null (and a request is queued) when it is not there yet. */
  get(mediaId: string, time: number): string | null;
  failed(mediaId: string): boolean;
  subscribe(listener: () => void): () => void;
  /** Changes whenever a new frame arrives; the snapshot for useSyncExternalStore. */
  getVersion(): number;
  invalidate(mediaId: string): void;
  dispose(): void;
}

const DEFAULT_MAX_ENTRIES = 400;
const GIVE_UP_AFTER_FAILURES = 2;
/** More waiting requests than this are tiles the user has already scrolled or zoomed past. */
const MAX_QUEUE = 48;

interface Job {
  key: string;
  mediaId: string;
  time: number;
}

export function createThumbnailService(options: {
  urlFor(mediaId: string): string | null;
  extractor: FrameExtractor;
  maxEntries?: number;
}): ThumbnailService {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const frames = new Map<string, string>(); // insertion order = least recently used first
  const failedKeys = new Set<string>();
  const failureCount = new Map<string, number>();
  const hasSucceeded = new Set<string>();
  const listeners = new Set<() => void>();
  let queue: Job[] = []; // the end is the newest request
  let running: Job | null = null;
  let version = 0;
  let disposed = false;

  const keyOf = (mediaId: string, time: number) => `${mediaId}@${time}`;
  const givenUp = (mediaId: string) =>
    !hasSucceeded.has(mediaId) && (failureCount.get(mediaId) ?? 0) >= GIVE_UP_AFTER_FAILURES;

  function notify() {
    for (const listener of Array.from(listeners)) listener();
  }

  function pump() {
    if (disposed || running || queue.length === 0) return;
    const job = queue.pop()!;
    const url = options.urlFor(job.mediaId);
    if (url === null || givenUp(job.mediaId)) {
      pump();
      return;
    }
    running = job;
    options.extractor.frame(url, job.time).then(
      (frame) => {
        if (disposed || running !== job) return;
        running = null;
        failedKeys.delete(job.key);
        hasSucceeded.add(job.mediaId);
        frames.set(job.key, frame);
        while (frames.size > maxEntries) frames.delete(frames.keys().next().value as string);
        version += 1;
        notify();
        pump();
      },
      () => {
        if (disposed || running !== job) return;
        running = null;
        failedKeys.add(job.key);
        failureCount.set(job.mediaId, (failureCount.get(job.mediaId) ?? 0) + 1);
        pump();
      },
    );
  }

  return {
    get(mediaId, time) {
      if (disposed) return null;
      const q = quantizeTime(time);
      const key = keyOf(mediaId, q);
      const cached = frames.get(key);
      if (cached !== undefined) {
        frames.delete(key); // touch: now the most recently used
        frames.set(key, cached);
        return cached;
      }
      if (failedKeys.has(key) || givenUp(mediaId) || options.urlFor(mediaId) === null) return null;
      if (running?.key === key) return null;
      queue = queue.filter((job) => job.key !== key); // asked again: move to the front
      queue.push({ key, mediaId, time: q });
      // The end of the queue is the newest request; drop the oldest ones first.
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      pump();
      return null;
    },

    failed: (mediaId) => givenUp(mediaId),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getVersion: () => version,

    invalidate(mediaId) {
      const prefix = `${mediaId}@`;
      for (const key of Array.from(frames.keys())) if (key.startsWith(prefix)) frames.delete(key);
      for (const key of Array.from(failedKeys)) if (key.startsWith(prefix)) failedKeys.delete(key);
      queue = queue.filter((job) => job.mediaId !== mediaId);
      failureCount.delete(mediaId);
      hasSucceeded.delete(mediaId);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      queue = [];
      running = null;
      listeners.clear();
      frames.clear();
      options.extractor.dispose();
    },
  };
}
