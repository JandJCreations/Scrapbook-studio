import { describe, expect, it } from "vitest";

import { needsSeek, planMediaSync } from "@/lib/engine/media-sync";
import type { SlotState } from "@/lib/engine/slots";
import { splitClip } from "@/lib/timeline/split";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: "m", sourceDuration: 100, ...overrides });

const slot = (id: string, overrides: Partial<SlotState> = {}): SlotState => ({
  id,
  kind: "video",
  mediaId: "m",
  clipId: null,
  currentTime: 0,
  ...overrides,
});

describe("needsSeek", () => {
  const forward = { active: true, reversed: false, playbackRate: 1 };
  const reversed = { active: true, reversed: true, playbackRate: 1 };
  const preload = { active: false, reversed: false, playbackRate: 1 };

  it("tolerates 0.25 s of timeline drift while playing", () => {
    expect(needsSeek(5.2, forward, 5, true)).toBe(false);
    expect(needsSeek(5.3, forward, 5, true)).toBe(true);
  });

  it("measures playing drift in timeline seconds, so speed does not matter", () => {
    const fast = { ...forward, playbackRate: 8 };
    expect(needsSeek(5 + 1.9, fast, 5, true)).toBe(false); // 1.9 / 8 = 0.24 s of timeline
    expect(needsSeek(5 + 2.5, fast, 5, true)).toBe(true); // 2.5 / 8 = 0.31 s
    const slow = { ...forward, playbackRate: 0.1 };
    expect(needsSeek(5.02, slow, 5, true)).toBe(false); // 0.02 / 0.1 = 0.2 s
    expect(needsSeek(5.05, slow, 5, true)).toBe(true); // 0.05 / 0.1 = 0.5 s
  });

  it("moves to any new position while paused, including a single frame step", () => {
    expect(needsSeek(5.0005, forward, 5, false)).toBe(false);
    expect(needsSeek(5 + 1 / 60, forward, 5, false)).toBe(true);
    expect(needsSeek(5 + 1 / 30, { ...forward, playbackRate: 0.5 }, 5, false)).toBe(true);
  });

  it("steps reversed clips every 0.04 s of timeline while playing", () => {
    expect(needsSeek(6.03, reversed, 6, true)).toBe(false);
    expect(needsSeek(6.05, reversed, 6, true)).toBe(true);
  });

  it("follows a paused reversed clip frame by frame", () => {
    expect(needsSeek(6.01, reversed, 6, false)).toBe(true);
  });

  it("positions a preload precisely, playing or not", () => {
    expect(needsSeek(0.0005, preload, 0, true)).toBe(false);
    expect(needsSeek(0.5, preload, 0, true)).toBe(true);
  });
});

describe("planMediaSync: a split is seamless", () => {
  // Main track: a [0,4] then b [4,10], two halves of one cut of file m.
  const project = () =>
    makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { start: 4, sourceIn: 4, sourceOut: 10 }),
    ]);

  it("before the cut, only the first half's element is used and it is left alone", () => {
    const plan = planMediaSync(project(), 3.5, true, [
      slot("s1", { clipId: "a", currentTime: 3.6 }),
    ]);
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toMatchObject({
      slotId: "s1",
      clipId: "a",
      load: false,
      seekTo: null,
      play: true,
    });
  });

  it("at the cut, the second half inherits the element with no load and no seek", () => {
    const plan = planMediaSync(project(), 4, true, [
      slot("s1", { clipId: "a", currentTime: 4.02 }),
    ]);
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]).toMatchObject({
      slotId: "s1",
      clipId: "b",
      load: false,
      seekTo: null,
      play: true,
    });
    expect(plan.releasedSlotIds).toEqual([]);
  });

  it("uses one element for three real split pieces across both cuts", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0.1, sourceOut: 3.1 }),
    ]);
    let split = splitClip(base, "a", 0.3, seqIds("s"));
    split = splitClip(split, "s-1", 1.0, seqIds("t"));

    for (const t of [0.25, 0.3, 0.9, 1.0, 1.1]) {
      const plan = planMediaSync(split, t, true, [slot("s1", { clipId: "a", currentTime: t + 0.1 })]);
      expect(plan.commands).toHaveLength(1);
      expect(plan.commands[0].load).toBe(false);
    }
  });
});

describe("planMediaSync: seeking and loading", () => {
  const single = () =>
    makeProject(makeStandardTracks(), [clip("a", { start: 0, sourceIn: 0, sourceOut: 10 })]);

  it("seeks a paused element that is off target", () => {
    const [command] = planMediaSync(single(), 2, false, [
      slot("s1", { clipId: "a", currentTime: 1 }),
    ]).commands;
    expect(command).toMatchObject({ seekTo: 2, play: false, load: false });
  });

  it("leaves a paused element that is on target", () => {
    const [command] = planMediaSync(single(), 2, false, [
      slot("s1", { clipId: "a", currentTime: 2.0005 }),
    ]).commands;
    expect(command.seekTo).toBeNull();
  });

  it("follows a single-frame step at 60 fps and at half speed", () => {
    const sixty = planMediaSync(single(), 2 + 1 / 60, false, [
      slot("s1", { clipId: "a", currentTime: 2 }),
    ]);
    expect(sixty.commands[0].seekTo).toBeCloseTo(2 + 1 / 60, 9);

    const halfSpeed = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 10, speed: 0.5 }),
    ]);
    const half = planMediaSync(halfSpeed, 4 + 1 / 30, false, [
      slot("s1", { clipId: "a", currentTime: 2 }),
    ]);
    expect(half.commands[0].seekTo).toBeCloseTo(2 + 1 / 60, 9);
  });

  it("reloads a slot that holds a different file and seeks it", () => {
    const [command] = planMediaSync(single(), 2, true, [slot("s1", { mediaId: "other" })]).commands;
    expect(command).toMatchObject({ slotId: "s1", load: true, seekTo: 2 });
  });

  it("asks for a new element with a load and a seek when there is none", () => {
    const [command] = planMediaSync(single(), 2, true, []).commands;
    expect(command).toMatchObject({ slotId: null, load: true, seekTo: 2, play: true });
  });

  it("steps a reversed clip silently", () => {
    const reversed = makeProject(makeStandardTracks(), [clip("a", { reversed: true })]);
    const near = planMediaSync(reversed, 4, true, [slot("s1", { clipId: "a", currentTime: 6.03 })]);
    expect(near.commands[0]).toMatchObject({ seekTo: null, play: false, gain: 0 });
    const far = planMediaSync(reversed, 4, true, [slot("s1", { clipId: "a", currentTime: 6.1 })]);
    expect(far.commands[0].seekTo).toBe(6);
  });

  it("carries the clip's gain and playback rate", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 10, speed: 2, volume: 50 }),
    ]);
    const [command] = planMediaSync(project, 1, true, []).commands;
    expect(command).toMatchObject({ playbackRate: 2, gain: 0.5 });
  });
});

describe("planMediaSync: preloading and releasing", () => {
  it("prepares the next clip's file early, positioned and not playing", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 4 }),
      clip("b", { mediaId: "m2", start: 4, sourceIn: 0, sourceOut: 6 }),
    ]);
    const plan = planMediaSync(project, 3.5, true, [
      slot("s1", { mediaId: "m1", clipId: "a", currentTime: 3.5 }),
    ]);
    const preload = plan.commands.find((c) => c.clipId === "b");
    expect(preload).toMatchObject({
      slotId: null,
      active: false,
      load: true,
      seekTo: 0,
      play: false,
      gain: 0,
    });
  });

  it("releases elements nothing needs any more", () => {
    const project = makeProject(makeStandardTracks(), []);
    const plan = planMediaSync(project, 1, true, [slot("s1", { clipId: "old" })]);
    expect(plan.commands).toEqual([]);
    expect(plan.releasedSlotIds).toEqual(["s1"]);
  });

  it("reports clips it could not place", () => {
    const clips = Array.from({ length: 8 }, (_, i) =>
      clip(`c${i}`, { trackId: "t2", mediaId: `m${i}`, start: 0, sourceIn: 0, sourceOut: 10 }),
    );
    const plan = planMediaSync(makeProject(makeStandardTracks(), clips), 1, true, []);
    expect(plan.commands).toHaveLength(6);
    expect(plan.droppedClipIds).toHaveLength(2);
  });
});
