export interface ObjectUrlDeps {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export interface ObjectUrlRegistry {
  /** Makes an object URL for a blob; the registry owns and later revokes it. */
  addBlob(mediaId: string, blob: Blob): string;
  /** Registers a remote URL; never revoked. */
  addUrl(mediaId: string, url: string): void;
  urlFor(mediaId: string): string | null;
  remove(mediaId: string): void;
  revokeAll(): void;
}

// Called lazily, so importing this module in a non-browser environment is safe.
const browserDeps: ObjectUrlDeps = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

export function createObjectUrlRegistry(deps: ObjectUrlDeps = browserDeps): ObjectUrlRegistry {
  const entries = new Map<string, { url: string; owned: boolean }>();

  function forget(mediaId: string) {
    const entry = entries.get(mediaId);
    if (entry?.owned) deps.revoke(entry.url);
    entries.delete(mediaId);
  }

  return {
    addBlob(mediaId, blob) {
      forget(mediaId);
      const url = deps.create(blob);
      entries.set(mediaId, { url, owned: true });
      return url;
    },
    addUrl(mediaId, url) {
      forget(mediaId);
      entries.set(mediaId, { url, owned: false });
    },
    urlFor: (mediaId) => entries.get(mediaId)?.url ?? null,
    remove: forget,
    revokeAll() {
      for (const mediaId of Array.from(entries.keys())) forget(mediaId);
    },
  };
}
