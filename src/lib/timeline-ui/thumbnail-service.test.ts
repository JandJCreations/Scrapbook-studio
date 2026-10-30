import { describe, expect, it } from "vitest";

import {
  createThumbnailService,
  type FrameExtractor,
} from "@/lib/timeline-ui/thumbnail-service";

/** An extractor the test finishes by hand, one request at a time. */
function fakeExtractor() {
  const calls: Array<{
    url: string;
    time: number;
    resolve: (frame: string) => void;
    reject: (error: Error) => void;
  }> = [];
  const state = { disposed: false };
  const extractor: FrameExtractor = {
    frame: (url, time) =>
      new Promise((resolve, reject) => {
        calls.push({ url, time, resolve, reject });
      }),
    dispose: () => {
      state.disposed = true;
    },
  };
  return { extractor, calls, state };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(options: { maxEntries?: number; urls?: Record<string, string | null> } = {}) {
  const fake = fakeExtractor();
  const urls = options.urls ?? { m: "blob:m", n: "blob:n" };
  const service = createThumbnailService({
    urlFor: (id) => urls[id] ?? null,
    extractor: fake.extractor,
    maxEntries: options.maxEntries,
  });
  const notified = { count: 0 };
  service.subscribe(() => {
    notified.count += 1;
  });
  return { service, ...fake, notified };
}

describe("createThumbnailService", () => {
  it("returns null, queues one extraction at the nearest half second, then serves the frame", async () => {
    const { service, calls, notified } = setup();
    expect(service.get("m", 2.2)).toBeNull();
    expect(service.get("m", 2.1)).toBeNull(); // same frame: not queued twice
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "blob:m", time: 2 });

    calls[0].resolve("data:frame-2");
    await flush();
    expect(service.get("m", 2.2)).toBe("data:frame-2");
    expect(service.getVersion()).toBe(1);
    expect(notified.count).toBe(1);
  });

  it("runs one extraction at a time, newest request first", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    service.get("m", 2);
    service.get("m", 3);
    expect(calls.map((c) => c.time)).toEqual([1]); // the first started immediately
    calls[0].resolve("a");
    await flush();
    expect(calls.map((c) => c.time)).toEqual([1, 3]); // then the newest, not the oldest
    calls[1].resolve("b");
    await flush();
    expect(calls.map((c) => c.time)).toEqual([1, 3, 2]);
  });

  it("moves a frame that is asked for again to the front of the queue", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    service.get("m", 2);
    service.get("m", 3);
    service.get("m", 2); // asked for again after the user scrolled back
    calls[0].resolve("a");
    await flush();
    expect(calls.map((c) => c.time)).toEqual([1, 2]);
  });

  it("queues nothing for a media that has no URL", () => {
    const { service, calls } = setup({ urls: { m: null } });
    expect(service.get("m", 1)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("drops the oldest frame past its limit", async () => {
    const { service, calls } = setup({ maxEntries: 2 });
    for (const t of [1, 2, 3]) {
      service.get("m", t);
      calls[calls.length - 1].resolve(`frame-${t}`);
      await flush();
    }
    expect(service.get("m", 2)).toBe("frame-2");
    expect(service.get("m", 3)).toBe("frame-3");
    expect(service.get("m", 1)).toBeNull(); // evicted, queued again
  });

  it("remembers a failed frame and does not retry it", async () => {
    const { service, calls, notified } = setup();
    service.get("m", 1);
    calls[0].reject(new Error("seek failed"));
    await flush();
    service.get("m", 1);
    expect(calls).toHaveLength(1);
    expect(service.failed("m")).toBe(false); // one failure is not enough to give up
    expect(notified.count).toBe(0);
  });

  it("gives up on a media after two failures with no success", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    calls[0].reject(new Error("bad"));
    await flush();
    service.get("m", 2);
    calls[1].reject(new Error("bad"));
    await flush();
    expect(service.failed("m")).toBe(true);
    service.get("m", 3);
    expect(calls).toHaveLength(2);
  });

  it("keeps trying a media that has produced a frame", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    calls[0].resolve("ok");
    await flush();
    service.get("m", 2);
    calls[1].reject(new Error("one bad seek"));
    await flush();
    service.get("m", 3);
    calls[2].reject(new Error("another"));
    await flush();
    expect(service.failed("m")).toBe(false);
  });

  it("forgets everything about a media on invalidate", async () => {
    const { service, calls } = setup();
    service.get("m", 1);
    calls[0].resolve("old");
    await flush();
    service.invalidate("m");
    expect(service.get("m", 1)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("stops everything on dispose, even for an extraction still running", async () => {
    const { service, calls, state, notified } = setup();
    service.get("m", 1);
    service.get("m", 2);
    service.dispose();
    expect(state.disposed).toBe(true);
    calls[0].resolve("late");
    await flush();
    expect(calls).toHaveLength(1); // nothing new started
    expect(notified.count).toBe(0);
    expect(service.get("m", 1)).toBeNull();
  });

  it("keeps only the newest requests when far more are asked for than can be shown", async () => {
    const { service, calls } = setup();
    for (let t = 1; t <= 100; t++) service.get("m", t); // tiles that scrolled past, then scrolled on
    expect(calls).toHaveLength(1); // the first started at once
    for (let i = 0; i < 200 && calls.length > i; i++) {
      calls[i].resolve(`f${i}`);
      await flush();
    }
    // The running one plus a bounded backlog, and the backlog is the newest part.
    expect(calls).toHaveLength(1 + 48);
    expect(calls[1].time).toBe(100); // newest first
    expect(calls[calls.length - 1].time).toBe(53); // the 48 newest were kept: 100 down to 53
    expect(calls.map((c) => c.time)).not.toContain(10);
  });

  it("stops notifying an unsubscribed listener", async () => {
    const fake = fakeExtractor();
    const service = createThumbnailService({ urlFor: () => "blob:x", extractor: fake.extractor });
    let heard = 0;
    const off = service.subscribe(() => {
      heard += 1;
    });
    service.get("m", 1);
    off();
    fake.calls[0].resolve("a");
    await flush();
    expect(heard).toBe(0);
  });
});
