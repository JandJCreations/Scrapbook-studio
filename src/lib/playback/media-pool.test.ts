import { describe, expect, it } from "vitest";

import type { MediaSyncPlan, SlotCommand } from "@/lib/engine/media-sync";
import { createMediaPool, type PoolElement } from "@/lib/playback/media-pool";
import { makeFakePoolDeps } from "@/lib/playback/test-utils";

// Compile-time check: a real media element satisfies PoolElement.
const realElementFits = (element: HTMLMediaElement): PoolElement => element;
void realElementFits;

const command = (overrides: Partial<SlotCommand> = {}): SlotCommand => ({
  slotId: null,
  clipId: "c1",
  mediaId: "m",
  kind: "video",
  active: true,
  load: true,
  seekTo: 2,
  play: true,
  playbackRate: 1,
  gain: 1,
  ...overrides,
});

const plan = (commands: SlotCommand[], releasedSlotIds: string[] = []): MediaSyncPlan => ({
  commands,
  releasedSlotIds,
  droppedClipIds: [],
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createMediaPool: carrying out commands", () => {
  it("creates an element, loads it, positions it, sets rate and gain, and plays", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ seekTo: 2, playbackRate: 2, gain: 0.5 })]));

    expect(created).toHaveLength(1);
    const { element } = created[0];
    expect(element.src).toBe("blob:m");
    expect(element.seeks).toEqual([2]);
    expect(element.playbackRate).toBe(2);
    expect(gains.get(element)?.last).toBe(0.5);
    expect(element.paused).toBe(false);
    expect(pool.slots()).toEqual([
      { id: "slot-1", kind: "video", mediaId: "m", clipId: "c1", currentTime: 2 },
    ]);
  });

  it("creates an audio element when the command is for audio", () => {
    const { deps, created } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command({ kind: "audio" })]));
    expect(created[0].kind).toBe("audio");
  });

  it("reuses a slot without reloading or seeking when the command says not to", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, gain: 0.25 })]));

    const { element } = created[0];
    expect(created).toHaveLength(1);
    expect(element.srcSets).toBe(1);
    expect(element.seeks).toEqual([2]);
    expect(gains.get(element)?.last).toBe(0.25);
  });

  it("points a reused slot at a different file when told to load", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([command({ slotId: "slot-1", clipId: "c2", mediaId: "other", seekTo: 0 })]));

    expect(created[0].element.src).toBe("blob:other");
    expect(pool.slots()[0]).toMatchObject({ mediaId: "other", clipId: "c2" });
  });

  it("creates a new element rather than failing when the slot id is unknown", () => {
    const { deps, created } = makeFakePoolDeps();
    createMediaPool(deps).apply(plan([command({ slotId: "ghost", load: false })]));
    expect(created).toHaveLength(1);
  });

  it("only plays a paused element and only pauses a playing one", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ play: true })]));
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: true })]));
    expect(created[0].element.playCalls).toBe(1);

    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: false })]));
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: false })]));
    expect(created[0].element.pauseCalls).toBe(1);
    expect(created[0].element.paused).toBe(true);
  });

  it("reports each element's live position for the next plan", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ seekTo: 2 })]));
    created[0].element.advance(1.5);
    expect(pool.slots()[0].currentTime).toBe(3.5);
  });
});

describe("createMediaPool: releasing", () => {
  it("pauses, silences and unassigns a released slot but keeps its file", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([], ["slot-1"]));

    const { element } = created[0];
    expect(element.paused).toBe(true);
    expect(gains.get(element)?.last).toBe(0);
    expect(pool.slots()[0]).toMatchObject({ clipId: null, mediaId: "m" });
    expect(pool.elementForClip("c1")).toBeUndefined();
  });

  it("lets a released slot be reused for the same file without a reload", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([], ["slot-1"]));
    pool.apply(plan([command({ slotId: "slot-1", clipId: "c2", load: false, seekTo: null })]));

    expect(created[0].element.srcSets).toBe(1);
    expect(pool.slots()[0].clipId).toBe("c2");
  });
});

describe("createMediaPool: which element serves a clip", () => {
  it("returns the element for an assigned clip and nothing for others", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    expect(pool.elementForClip("c1")).toBe(created[0].element);
    expect(pool.elementForClip("nope")).toBeUndefined();
  });
});

describe("createMediaPool: problems", () => {
  it("shows nothing and reports missing media once, then recovers when the URL appears", () => {
    const { deps, created, gains, problems, urls } = makeFakePoolDeps({ urls: { m: null } });
    const pool = createMediaPool(deps);

    for (let i = 0; i < 3; i++) pool.apply(plan([command({ slotId: i === 0 ? null : "slot-1" })]));

    const { element } = created[0];
    expect(element.srcSets).toBe(0);
    expect(element.paused).toBe(true);
    expect(gains.get(element)?.last).toBe(0);
    expect(pool.elementForClip("c1")).toBeUndefined();
    expect(pool.slots()[0].mediaId).toBeNull();
    expect(problems).toEqual([{ clipId: "c1", kind: "missing-media" }]);

    urls.m = "blob:found";
    pool.apply(plan([command({ slotId: "slot-1" })]));
    expect(element.src).toBe("blob:found");
    expect(pool.elementForClip("c1")).toBe(element);
  });

  it("reports blocked playback once and plays after it is allowed", async () => {
    const { deps, created, problems } = makeFakePoolDeps({ playError: new Error("NotAllowedError") });
    const pool = createMediaPool(deps);

    pool.apply(plan([command()]));
    await flush();
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null })]));
    await flush();

    expect(problems).toEqual([{ clipId: "c1", kind: "play-blocked" }]);
    expect(created[0].element.paused).toBe(true);

    created[0].element.playError = null;
    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null })]));
    await flush();
    expect(created[0].element.paused).toBe(false);
    expect(problems).toHaveLength(1);
  });
});

describe("createMediaPool: dispose", () => {
  it("stops every element, empties it and forgets the slots", () => {
    const { deps, created, gains } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.dispose();

    const { element } = created[0];
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(gains.get(element)?.last).toBe(0);
    expect(pool.slots()).toEqual([]);
    expect(pool.elementForClip("c1")).toBeUndefined();
  });
});

describe("createMediaPool: real play() behaviour", () => {
  it("does not report an interrupted play (AbortError) as blocked", async () => {
    const abort = Object.assign(new Error("interrupted by pause"), { name: "AbortError" });
    const { deps, problems } = makeFakePoolDeps({ playError: abort });
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    await flush();
    expect(problems).toEqual([]);
  });

  it("ignores a rejection that arrives after the slot moved on", async () => {
    const { deps, problems } = makeFakePoolDeps({ playError: new Error("late") });
    const pool = createMediaPool(deps);
    pool.apply(plan([command()]));
    pool.apply(plan([], ["slot-1"]));
    await flush();
    expect(problems).toEqual([]);
  });

  it("does not restart an element that has played to its end", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ seekTo: 0 })]));
    const { element } = created[0];
    element.duration = 5;
    element.advance(10);
    expect(element.ended).toBe(true);

    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: null, play: true })]));
    expect(element.restarts).toBe(0);
    expect(element.playCalls).toBe(1);
    expect(element.currentTime).toBe(5);
  });

  it("plays again once the element is moved away from its end", () => {
    const { deps, created } = makeFakePoolDeps();
    const pool = createMediaPool(deps);
    pool.apply(plan([command({ seekTo: 0 })]));
    const { element } = created[0];
    element.duration = 5;
    element.advance(10);

    pool.apply(plan([command({ slotId: "slot-1", load: false, seekTo: 1, play: true })]));
    expect(element.playCalls).toBe(2);
    expect(element.paused).toBe(false);
    expect(element.restarts).toBe(0);
    expect(element.currentTime).toBe(1);
  });
});
