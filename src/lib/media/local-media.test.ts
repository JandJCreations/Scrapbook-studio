import { describe, expect, it, vi } from "vitest";

import { createStoreLocalFiles, isUsable, withLocalFiles } from "@/lib/media/local-media";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import type { MediaItem } from "@/types/media";

const item = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "m1",
  name: "Beach",
  type: "image",
  mimeType: "image/jpeg",
  size: 1,
  url: "",
  thumbnailUrl: null,
  duration: null,
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "ready",
  progress: 100,
  ...overrides,
});

describe("isUsable", () => {
  it("is true for a file that is uploaded, or one still uploading that is on this computer", () => {
    expect(isUsable(item({ status: "ready" }))).toBe(true);
    expect(isUsable(item({ status: "processing", progress: 20, localUrl: "blob:x" }))).toBe(true);
  });

  it("is false while uploading with nothing local to play, and for a file that failed", () => {
    expect(isUsable(item({ status: "processing" }))).toBe(false);
    expect(isUsable(item({ status: "error", localUrl: "blob:x" }))).toBe(false);
  });
});

describe("withLocalFiles", () => {
  const base = (): MediaUrlSource & { ensured: string[][] } => {
    const ensured: string[][] = [];
    return {
      ensured,
      urlFor: (id) => (id === "stored" ? "https://signed/stored" : null),
      posterFor: (id) => (id === "stored" ? "https://signed/poster" : null),
      ensure: async (ids) => {
        ensured.push(ids);
      },
      subscribe: () => () => {},
      getVersion: () => 7,
    };
  };
  const local = (files: Record<string, string>) => {
    let listener: (() => void) | null = null;
    let version = 0;
    return {
      urlFor: (id: string) => files[id] ?? null,
      subscribe: (fn: () => void) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
      getVersion: () => version,
      change: (id: string, url: string) => {
        files[id] = url;
        version += 1;
        listener?.();
      },
    };
  };

  it("answers with the file on this computer when there is one, and otherwise with the stored copy", () => {
    const source = withLocalFiles(base(), local({ fresh: "blob:fresh" }));
    expect(source.urlFor("fresh")).toBe("blob:fresh");
    expect(source.urlFor("stored")).toBe("https://signed/stored");
    expect(source.urlFor("unknown")).toBeNull();
  });

  it("prefers the local file even when a stored copy exists, so playback never waits on the network", () => {
    const source = withLocalFiles(base(), local({ stored: "blob:mine" }));
    expect(source.urlFor("stored")).toBe("blob:mine");
  });

  it("does not ask the server for files it has locally, but still asks for the rest", async () => {
    const inner = base();
    const source = withLocalFiles(inner, local({ fresh: "blob:fresh" }));
    await source.ensure(["fresh", "stored"]);
    expect(inner.ensured).toEqual([["stored"]]);
  });

  it("passes the poster through for stored files", () => {
    expect(withLocalFiles(base(), local({})).posterFor("stored")).toBe("https://signed/poster");
  });

  it("tells listeners when a local file appears, and its version moves with it", () => {
    const l = local({});
    const source = withLocalFiles(base(), l);
    const listener = vi.fn();
    const stop = source.subscribe(listener);
    const before = source.getVersion();
    l.change("fresh", "blob:fresh");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(source.getVersion()).not.toBe(before);
    stop();
    l.change("another", "blob:another");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("createStoreLocalFiles", () => {
  /** A store like zustand's: state, and subscribe that is told about every change. */
  function fakeStore(initial: MediaItem[]) {
    let state = { items: initial };
    const listeners = new Set<() => void>();
    return {
      getState: () => state,
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      set(items: MediaItem[]) {
        state = { items };
        for (const fn of Array.from(listeners)) fn();
      },
      count: () => listeners.size,
    };
  }

  it("finds the local address of an item by id", () => {
    const files = createStoreLocalFiles(fakeStore([item({ id: "a", localUrl: "blob:a" }), item({ id: "b" })]));
    expect(files.urlFor("a")).toBe("blob:a");
    expect(files.urlFor("b")).toBeNull();
    expect(files.urlFor("zzz")).toBeNull();
  });

  it("tells every listener when a local file appears, not on a mere progress change", () => {
    const store = fakeStore([]);
    const files = createStoreLocalFiles(store);
    const first = vi.fn();
    const second = vi.fn();
    files.subscribe(first);
    files.subscribe(second);
    store.set([item({ id: "a", status: "processing", progress: 0, localUrl: "blob:a" })]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    store.set([item({ id: "a", status: "processing", progress: 50, localUrl: "blob:a" })]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(files.getVersion()).toBe(1);
  });

  it("lets go of the store when the last listener leaves, and picks up again when one returns", () => {
    const store = fakeStore([]);
    const files = createStoreLocalFiles(store);
    const stopA = files.subscribe(vi.fn());
    const stopB = files.subscribe(vi.fn());
    expect(store.count()).toBe(1);
    stopA();
    expect(store.count()).toBe(1);
    stopB();
    expect(store.count()).toBe(0);
    const again = vi.fn();
    files.subscribe(again);
    store.set([item({ id: "n", localUrl: "blob:n" })]);
    expect(again).toHaveBeenCalledTimes(1);
  });
});
