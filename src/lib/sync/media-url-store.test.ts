import { describe, expect, it } from "vitest";

import { createMediaUrlStore } from "@/lib/sync/media-url-store";
import type { MediaRow, MediaUrlDeps } from "@/lib/sync/media-urls";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function setup(options: { missing?: string[]; fail?: boolean } = {}) {
  const calls: string[][] = [];
  const clock = { now: 0 };
  let failNext = options.fail ?? false;
  const deps: MediaUrlDeps = {
    async fetchMediaRows(ids) {
      calls.push([...ids]);
      if (failNext) {
        failNext = false;
        throw new Error("network");
      }
      return ids
        .filter((id) => !(options.missing ?? []).includes(id))
        .map<MediaRow>((id) => ({
          id,
          type: "video",
          storage_path: `path/${id}`,
          thumbnail_path: `thumb/${id}`,
        }));
    },
    async getSignedUrls(paths) {
      return new Map(paths.map((p) => [p, `https://signed/${p}?t=${clock.now}`]));
    },
  };
  const store = createMediaUrlStore({ deps, now: () => clock.now, ttlMs: 1000, retryAfterMs: 100 });
  const heard = { count: 0 };
  store.subscribe(() => {
    heard.count += 1;
  });
  return { store, calls, clock, heard, failOnce: () => (failNext = true) };
}

describe("createMediaUrlStore", () => {
  it("resolves ids once, serves url and poster, and notifies", async () => {
    const { store, calls, heard } = setup();
    expect(store.urlFor(A)).toBeNull();
    await store.ensure([A, B]);
    expect(calls).toEqual([[A, B]]);
    expect(store.urlFor(A)).toBe(`https://signed/path/${A}?t=0`);
    expect(store.posterFor(A)).toBe(`https://signed/thumb/${A}?t=0`);
    expect(store.getVersion()).toBe(1);
    expect(heard.count).toBe(1);

    await store.ensure([A]);
    expect(calls).toHaveLength(1); // already resolved
  });

  it("ignores bundled-asset ids that do not live in Storage", async () => {
    const { store, calls } = setup();
    await store.ensure(["asset:star", "template-x-photo"]);
    expect(calls).toHaveLength(0);
    expect(store.urlFor("asset:star")).toBeNull();
  });

  it("shares one request between overlapping calls", async () => {
    const { store, calls } = setup();
    await Promise.all([store.ensure([A]), store.ensure([A, B]), store.ensure([B])]);
    expect(calls.flat().filter((id) => id === A)).toHaveLength(1);
    expect(calls.flat().filter((id) => id === B)).toHaveLength(1);
  });

  it("refreshes an expired url", async () => {
    const { store, calls, clock } = setup();
    await store.ensure([A]);
    clock.now = 2000; // past the 1000 ms lifetime
    expect(store.urlFor(A)).toBe(`https://signed/path/${A}?t=0`); // old one still served meanwhile
    await store.ensure([A]);
    expect(calls).toHaveLength(2);
    expect(store.urlFor(A)).toBe(`https://signed/path/${A}?t=2000`);
  });

  it("does not hammer ids the server does not know, but tries again later", async () => {
    const { store, calls, clock } = setup({ missing: [A] });
    await store.ensure([A]);
    await store.ensure([A]);
    expect(calls).toHaveLength(1);
    expect(store.urlFor(A)).toBeNull();
    clock.now = 500; // past the retry delay
    await store.ensure([A]);
    expect(calls).toHaveLength(2);
  });

  it("survives a failed request and retries after the delay", async () => {
    const { store, calls, clock, failOnce } = setup();
    failOnce();
    await expect(store.ensure([A])).resolves.toBeUndefined();
    expect(store.urlFor(A)).toBeNull();
    await store.ensure([A]); // too soon: no new request
    expect(calls).toHaveLength(1);
    clock.now = 500;
    await store.ensure([A]);
    expect(calls).toHaveLength(2);
    expect(store.urlFor(A)).not.toBeNull();
  });

  it("ignores results that arrive after dispose", async () => {
    const { store, heard } = setup();
    const pending = store.ensure([A]);
    store.dispose();
    await pending;
    expect(store.urlFor(A)).toBeNull();
    expect(heard.count).toBe(0);
  });
});
