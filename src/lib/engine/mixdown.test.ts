import { describe, expect, it } from "vitest";

import { gainEnvelope, planMixdown, type GainPoint } from "@/lib/engine/mixdown";
import { clipGainAt } from "@/lib/timeline/active-clips";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: `file-${id}`, sourceDuration: 100, ...overrides });

/** Linear interpolation of an envelope, the way an audio gain node ramps. */
function valueAt(points: GainPoint[], time: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time;
      return span === 0 ? b.value : a.value + ((b.value - a.value) * (time - a.time)) / span;
    }
  }
  throw new Error(`time ${time} outside the envelope`);
}

describe("gainEnvelope", () => {
  it("is flat at the clip volume without fades", () => {
    const c = clip("a", { start: 2, sourceIn: 0, sourceOut: 10, volume: 50 });
    expect(gainEnvelope(c)).toEqual([
      { time: 2, value: 0.5 },
      { time: 12, value: 0.5 },
    ]);
  });

  it("ramps in and out at the fade edges", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 2, fadeOut: 2 });
    expect(gainEnvelope(c)).toEqual([
      { time: 0, value: 0 },
      { time: 2, value: 1 },
      { time: 8, value: 1 },
      { time: 10, value: 0 },
    ]);
  });

  it("uses timeline time, so speed shortens the envelope", () => {
    const c = clip("a", { start: 1, sourceIn: 0, sourceOut: 10, speed: 2 });
    const points = gainEnvelope(c);
    expect(points[0].time).toBe(1);
    expect(points[points.length - 1].time).toBe(6);
  });

  it("makes a triangle when the fades exactly meet", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 5, fadeOut: 5 });
    expect(gainEnvelope(c)).toEqual([
      { time: 0, value: 0 },
      { time: 5, value: 1 },
      { time: 10, value: 0 },
    ]);
  });

  it("follows the real gain when the fades overlap", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 10, fadeOut: 10 });
    const points = gainEnvelope(c);
    for (const t of [0, 1, 2.5, 5, 7.5, 9, 10]) {
      expect(valueAt(points, t)).toBeCloseTo(clipGainAt(c, t), 2);
    }
  });

  it("copes with a fade longer than the clip", () => {
    const c = clip("a", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 12 });
    const points = gainEnvelope(c);
    expect(points[0]).toEqual({ time: 0, value: 0 });
    expect(points[points.length - 1].value).toBeCloseTo(10 / 12, 9);
    for (const p of points) expect(p.value).toBeGreaterThanOrEqual(0);
  });
});

describe("planMixdown", () => {
  it("is empty for an empty project", () => {
    expect(planMixdown(makeProject(makeStandardTracks(), []))).toEqual({ duration: 0, items: [] });
  });

  it("includes a video clip's own sound", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("v", { start: 0, sourceIn: 2, sourceOut: 12 }),
    ]);
    const plan = planMixdown(project);
    expect(plan.duration).toBe(10);
    expect(plan.items).toEqual([
      {
        clipId: "v",
        mediaId: "file-v",
        startAt: 0,
        sourceIn: 2,
        sourceOut: 12,
        playbackRate: 1,
        reversed: false,
        gainPoints: [
          { time: 0, value: 1 },
          { time: 10, value: 1 },
        ],
      },
    ]);
  });

  it("includes audio clips and keeps reversed and speed information", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("s", { kind: "audio", trackId: "t3", start: 2, sourceIn: 1, sourceOut: 5, speed: 2, reversed: true }),
    ]);
    expect(planMixdown(project).items[0]).toMatchObject({
      startAt: 2,
      sourceIn: 1,
      sourceOut: 5,
      playbackRate: 2,
      reversed: true,
    });
  });

  it("leaves out images, text and stickers", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("i", { kind: "image", trackId: "t2", sourceDuration: null }),
      clip("t", { kind: "text", trackId: "t2", sourceDuration: null }),
    ]);
    expect(planMixdown(project).items).toEqual([]);
  });

  it("leaves out muted clips and muted tracks", () => {
    const tracks = [makeTrack({ id: "t1", type: "video" }), makeTrack({ id: "t3", type: "audio", muted: true, order: 1 })];
    const project = makeProject(tracks, [
      clip("a", { muted: true }),
      clip("b", { kind: "audio", trackId: "t3" }),
      clip("c"),
    ]);
    expect(planMixdown(project).items.map((i) => i.clipId)).toEqual(["c"]);
  });

  it("when a track is soloed, only soloed tracks are mixed", () => {
    const tracks = [
      makeTrack({ id: "t1", type: "video" }),
      makeTrack({ id: "t3", type: "audio", solo: true, order: 1 }),
    ];
    const project = makeProject(tracks, [clip("v"), clip("s", { kind: "audio", trackId: "t3" })]);
    expect(planMixdown(project).items.map((i) => i.clipId)).toEqual(["s"]);
  });

  it("sorts by start time, then clip id", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("z", { kind: "audio", trackId: "t3", start: 5 }),
      clip("b", { kind: "audio", trackId: "t3", start: 1 }),
      clip("a", { kind: "audio", trackId: "t3", start: 1 }),
    ]);
    expect(planMixdown(project).items.map((i) => i.clipId)).toEqual(["a", "b", "z"]);
  });

  it("matches the live gain at a fade for the same clip", () => {
    const c = clip("v", { start: 0, sourceIn: 0, sourceOut: 10, fadeIn: 2, volume: 80 });
    const [item] = planMixdown(makeProject(makeStandardTracks(), [c])).items;
    expect(valueAt(item.gainPoints, 1)).toBeCloseTo(clipGainAt(c, 1), 9);
    expect(valueAt(item.gainPoints, 5)).toBeCloseTo(clipGainAt(c, 5), 9);
  });
});
