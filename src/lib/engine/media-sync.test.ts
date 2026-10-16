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
  const playing = { active: true, reversed: false, shouldPlay: true };
  const paused = { active: true, reversed: false, shouldPlay: false };
  const reversed = { active: true, reversed: true, shouldPlay: false };
  const preload = { active: false, reversed: false, shouldPlay: false };

  it("tolerates drift up to 0.25 s while playing", () => {
    expect(needsSeek(5.2, playing, 5)).toBe(false);
    expect(needsSeek(5.3, playing, 5)).toBe(true);
  });

  it("is strict (0.02 s) while paused or scrubbing", () => {
    expect(needsSeek(5.01, paused, 5)).toBe(false);
    expect(needsSeek(5.03, paused, 5)).toBe(true);
  });

  it("steps reversed clips every 0.04 s", () => {
    expect(needsSeek(6.03, reversed, 6)).toBe(false);
    expect(needsSeek(6.05, reversed, 6)).toBe(true);
  });

  it("positions a preload precisely", () => {
    expect(needsSeek(0.01, preload, 0)).toBe(false);
    expect(needsSeek(0.5, preload, 0)).toBe(true);
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
      slot("s1", { clipId: "a", currentTime: 2.01 }),
    ]).commands;
    expect(command.seekTo).toBeNull();
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
