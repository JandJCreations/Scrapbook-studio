import { describe, expect, it } from "vitest";

import { addMedia, summarizeErrors, type AddMediaDeps } from "@/lib/playback/add-media";
import type { MediaItem } from "@/lib/playback/harness-ops";
import { createObjectUrlRegistry } from "@/lib/playback/object-url-registry";

function setup(options: { alive?: () => boolean; readInfo?: AddMediaDeps["readInfo"] } = {}) {
  const created: string[] = [];
  const revoked: string[] = [];
  const registry = createObjectUrlRegistry({
    create: () => {
      const url = `blob:${created.length + 1}`;
      created.push(url);
      return url;
    },
    revoke: (url) => {
      revoked.push(url);
    },
  });
  const committed: MediaItem[] = [];
  let n = 0;
  const deps: AddMediaDeps = {
    registry,
    readInfo: options.readInfo ?? (async () => ({ duration: 6, width: 640, height: 360 })),
    commit: (item) => committed.push(item),
    isAlive: options.alive ?? (() => true),
    newId: () => `m${++n}`,
  };
  return { deps, registry, created, revoked, committed };
}

describe("addMedia", () => {
  it("registers a blob, reads its info and commits one item", async () => {
    const s = setup();
    const result = await addMedia(s.deps, { blob: new Blob(["x"]) }, "clip.mp4", "video");
    expect(result).toEqual({ ok: true });
    expect(s.committed).toEqual([
      { mediaId: "m1", name: "clip.mp4", kind: "video", duration: 6, width: 640, height: 360 },
    ]);
    expect(s.registry.urlFor("m1")).toBe("blob:1");
  });

  it("registers a remote url without creating an object url", async () => {
    const s = setup();
    await addMedia(s.deps, { url: "https://example.com/a.mp4" }, "a.mp4", "video");
    expect(s.created).toEqual([]);
    expect(s.registry.urlFor("m1")).toBe("https://example.com/a.mp4");
  });

  it("returns the error and forgets the file when it cannot be read", async () => {
    const s = setup({ readInfo: async () => Promise.reject(new Error("nope")) });
    const result = await addMedia(s.deps, { blob: new Blob(["x"]) }, "bad.mp4", "video");
    expect(result).toEqual({ ok: false, error: "nope" });
    expect(s.committed).toEqual([]);
    expect(s.revoked).toEqual(["blob:1"]);
    expect(s.registry.urlFor("m1")).toBeNull();
  });

  it("does nothing at all when the page is already gone", async () => {
    const s = setup({ alive: () => false });
    const result = await addMedia(s.deps, { blob: new Blob(["x"]) }, "a.mp4", "video");
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(s.created).toEqual([]);
    expect(s.committed).toEqual([]);
  });

  it("revokes the url and commits nothing when the page goes away while reading", async () => {
    let alive = true;
    const s = setup({
      alive: () => alive,
      readInfo: async () => {
        alive = false;
        return { duration: 6, width: 640, height: 360 };
      },
    });
    const result = await addMedia(s.deps, { blob: new Blob(["x"]) }, "a.mp4", "video");
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(s.committed).toEqual([]);
    expect(s.revoked).toEqual(["blob:1"]);
  });
});

describe("summarizeErrors", () => {
  it("is null when nothing failed", () => {
    expect(summarizeErrors([{ ok: true }, { ok: false, cancelled: true }])).toBeNull();
  });

  it("keeps every distinct error instead of only the last one", () => {
    const text = summarizeErrors([
      { ok: false, error: "first" },
      { ok: true },
      { ok: false, error: "second" },
      { ok: false, error: "first" },
    ]);
    expect(text).toBe("first · second");
  });
});
