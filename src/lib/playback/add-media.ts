import type { MediaItem } from "@/lib/playback/harness-ops";
import type { ObjectUrlRegistry } from "@/lib/playback/object-url-registry";

export interface AddMediaDeps {
  registry: ObjectUrlRegistry;
  readInfo(
    url: string,
    kind: MediaItem["kind"],
  ): Promise<{ duration: number; width: number; height: number }>;
  /** Puts the media on the project; only called while the page is alive. */
  commit(item: MediaItem): void;
  /** False once the page that started this work has gone away. */
  isAlive(): boolean;
  newId(): string;
}

export type AddResult =
  | { ok: true }
  | { ok: false; error: string; cancelled?: undefined }
  | { ok: false; cancelled: true; error?: undefined };

/**
 * Registers a file, reads its length and size, and commits it, unless the page
 * goes away first: then it releases the file and touches nothing else.
 */
export async function addMedia(
  deps: AddMediaDeps,
  source: { blob: Blob } | { url: string },
  name: string,
  kind: MediaItem["kind"],
): Promise<AddResult> {
  if (!deps.isAlive()) return { ok: false, cancelled: true };

  const mediaId = deps.newId();
  let url: string;
  if ("blob" in source) {
    url = deps.registry.addBlob(mediaId, source.blob);
  } else {
    deps.registry.addUrl(mediaId, source.url);
    url = source.url;
  }

  let info: { duration: number; width: number; height: number };
  try {
    info = await deps.readInfo(url, kind);
  } catch (error) {
    deps.registry.remove(mediaId);
    if (!deps.isAlive()) return { ok: false, cancelled: true };
    return { ok: false, error: error instanceof Error ? error.message : "Could not add that file." };
  }

  if (!deps.isAlive()) {
    deps.registry.remove(mediaId);
    return { ok: false, cancelled: true };
  }
  deps.commit({ mediaId, name, kind, ...info });
  return { ok: true };
}

/** Every distinct failure from a batch, in order, or null when nothing failed. */
export function summarizeErrors(results: AddResult[]): string | null {
  const errors: string[] = [];
  for (const result of results) {
    if (!result.ok && result.error !== undefined && !errors.includes(result.error)) {
      errors.push(result.error);
    }
  }
  return errors.length > 0 ? errors.join(" · ") : null;
}
