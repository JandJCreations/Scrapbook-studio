import { describe, expect, it } from "vitest";

import { clipsOnTrack } from "@/lib/timeline/lookup";
import { trimClip } from "@/lib/timeline/trim";
import { getClip, makeClip, makeProject, makeTrack } from "@/lib/timeline/test-utils";
import type { Keyframe } from "@/types/keyframe";
import type { Clip } from "@/types/timeline";

const overlay = makeTrack({ id: "t2", type: "overlay", order: 0 });
const main = makeTrack({ id: "t1", type: "video", order: 1 });

function freeProject(overrides: Partial<Clip>) {
  return makeProject([overlay], [makeClip({ id: "a", trackId: "t2", ...overrides })]);
}

const kf = (time: number): Keyframe => ({
  id: `k${time}`,
  time,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
});

describe("trimClip: end edge", () => {
  it("shortens the clip", () => {
    const result = trimClip(freeProject({ start: 0, sourceOut: 10 }), "a", "end", 6);
    expect(getClip(result, "a")).toMatchObject({ start: 0, sourceIn: 0, sourceOut: 6 });
  });

  it("extends only as far as the source file allows", () => {
    const result = trimClip(
      freeProject({ sourceIn: 0, sourceOut: 10, sourceDuration: 20 }),
      "a",
      "end",
      100,
    );
    expect(getClip(result, "a").sourceOut).toBe(20);
  });

  it("never goes below the minimum duration", () => {
    const result = trimClip(freeProject({ start: 0, sourceOut: 10 }), "a", "end", 0.01);
    expect(getClip(result, "a").sourceOut).toBeCloseTo(0.1, 9);
  });

  it("accounts for speed", () => {
    const base = freeProject({ sourceIn: 0, sourceOut: 10, speed: 2, sourceDuration: 20 });
    expect(getClip(trimClip(base, "a", "end", 3), "a").sourceOut).toBe(6);
    expect(getClip(trimClip(base, "a", "end", 100), "a").sourceOut).toBe(20);
  });

  it("lets a still with unbounded source extend freely", () => {
    const result = trimClip(
      freeProject({ kind: "image", sourceDuration: null, sourceIn: 0, sourceOut: 5 }),
      "a",
      "end",
      30,
    );
    expect(getClip(result, "a").sourceOut).toBe(30);
  });

  it("trims a reversed clip from the source start", () => {
    const result = trimClip(freeProject({ sourceIn: 0, sourceOut: 10, reversed: true }), "a", "end", 4);
    expect(getClip(result, "a")).toMatchObject({ sourceIn: 6, sourceOut: 10 });
  });

  it("returns the same project when extending a reversed clip past its source", () => {
    const project = freeProject({ sourceIn: 0, sourceOut: 10, reversed: true });
    expect(trimClip(project, "a", "end", 100)).toBe(project);
  });
});

describe("trimClip: start edge", () => {
  it("shortens from the front and advances the source in-point", () => {
    const result = trimClip(freeProject({ start: 5, sourceIn: 0, sourceOut: 10 }), "a", "start", 7);
    expect(getClip(result, "a")).toMatchObject({ start: 7, sourceIn: 2, sourceOut: 10 });
  });

  it("cannot extend before the start of the source file", () => {
    const result = trimClip(
      freeProject({ start: 5, sourceIn: 2, sourceOut: 12, sourceDuration: 20 }),
      "a",
      "start",
      0,
    );
    expect(getClip(result, "a")).toMatchObject({ start: 3, sourceIn: 0, sourceOut: 12 });
  });

  it("cannot move before timeline time 0", () => {
    const result = trimClip(
      freeProject({ start: 1, sourceIn: 5, sourceOut: 15 }),
      "a",
      "start",
      -5,
    );
    expect(getClip(result, "a")).toMatchObject({ start: 0, sourceIn: 4, sourceOut: 15 });
  });

  it("trims a reversed clip from the source end", () => {
    const result = trimClip(
      freeProject({ start: 5, sourceIn: 0, sourceOut: 10, reversed: true, sourceDuration: 20 }),
      "a",
      "start",
      7,
    );
    expect(getClip(result, "a")).toMatchObject({ start: 7, sourceIn: 0, sourceOut: 8 });
  });

  it("rebases keyframes so they stay attached to the same moment, and restores them on re-extend", () => {
    const base = freeProject({ start: 5, sourceIn: 0, sourceOut: 10, keyframes: [kf(1), kf(3)] });
    const trimmed = trimClip(base, "a", "start", 7);
    expect(getClip(trimmed, "a").keyframes.map((k) => k.time)).toEqual([-1, 1]);
    const restored = trimClip(trimmed, "a", "start", 5);
    expect(getClip(restored, "a").keyframes.map((k) => k.time)).toEqual([1, 3]);
  });
});

describe("trimClip: magnetic main track", () => {
  const twoClips = () =>
    makeProject(
      [main],
      [
        makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 5 }),
        makeClip({ id: "b", start: 5, sourceIn: 0, sourceOut: 5 }),
      ],
    );

  it("ripples later clips left when the end edge shortens a clip", () => {
    const result = trimClip(twoClips(), "a", "end", 3);
    expect(getClip(result, "a").sourceOut).toBe(3);
    expect(getClip(result, "b").start).toBe(3);
  });

  it("keeps the clip in place when the start edge shortens it", () => {
    const result = trimClip(twoClips(), "b", "start", 7);
    expect(getClip(result, "b")).toMatchObject({ start: 5, sourceIn: 2, sourceOut: 5 });
    expect(clipsOnTrack(result, "t1").map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("trimClip: no-ops", () => {
  it("returns the same project for an unknown clip", () => {
    const project = freeProject({});
    expect(trimClip(project, "nope", "end", 3)).toBe(project);
  });

  it("returns the same project for a locked clip", () => {
    const project = freeProject({ locked: true });
    expect(trimClip(project, "a", "end", 3)).toBe(project);
  });

  it("returns the same project when the edge does not move", () => {
    const project = freeProject({ start: 0, sourceOut: 10 });
    expect(trimClip(project, "a", "end", 10)).toBe(project);
  });
});

describe("trimClip: invariants", () => {
  const targets = [-10, 0, 1, 4, 5, 7, 10, 13, 20, 100];

  it.each([false, true])("keeps source bounds valid for reversed=%s", (reversed) => {
    for (const speed of [0.5, 1, 2]) {
      for (const edge of ["start", "end"] as const) {
        for (const to of targets) {
          const project = freeProject({
            start: 4,
            sourceIn: 3,
            sourceOut: 9,
            sourceDuration: 12,
            speed,
            reversed,
          });
          const clip = getClip(trimClip(project, "a", edge, to), "a");
          const label = `speed=${speed} edge=${edge} to=${to}`;
          expect(clip.sourceIn, label).toBeGreaterThanOrEqual(-1e-9);
          expect(clip.sourceOut, label).toBeLessThanOrEqual(12 + 1e-9);
          expect(clip.sourceIn, label).toBeLessThan(clip.sourceOut);
          expect(clip.start, label).toBeGreaterThanOrEqual(-1e-9);
        }
      }
    }
  });
});

describe("trimClip: exact source bounds", () => {
  it("lands exactly on the source end when clamped (speed 0.3)", () => {
    const project = freeProject({ speed: 0.3, sourceIn: 0.2, sourceOut: 0.7, sourceDuration: 3.7 });
    expect(getClip(trimClip(project, "a", "end", 100), "a").sourceOut).toBeLessThanOrEqual(3.7);
  });

  it("never leaves a negative sourceIn when a reversed clip is clamped", () => {
    const project = freeProject({
      speed: 0.3, sourceIn: 0.2, sourceOut: 0.7, sourceDuration: 3.7, reversed: true,
    });
    expect(getClip(trimClip(project, "a", "end", 100), "a").sourceIn).toBeGreaterThanOrEqual(0);
  });

  it("keeps source bounds exact across awkward speeds, edges and targets", () => {
    for (const speed of [0.3, 0.7, 3, 7]) {
      for (const reversed of [false, true]) {
        for (const edge of ["start", "end"] as const) {
          for (const to of [-100, -3, 0, 2, 100]) {
            const project = freeProject({
              start: 0.9, sourceIn: 0.2, sourceOut: 0.7, sourceDuration: 3.7, speed, reversed,
            });
            const clip = getClip(trimClip(project, "a", edge, to), "a");
            const label = `speed=${speed} reversed=${reversed} edge=${edge} to=${to}`;
            expect(clip.sourceIn, label).toBeGreaterThanOrEqual(0);
            expect(clip.sourceOut, label).toBeLessThanOrEqual(3.7);
            expect(clip.sourceIn, label).toBeLessThan(clip.sourceOut);
            expect(clip.start, label).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe("trimClip: re-extending a head on the main track", () => {
  it("lets the first main-track clip regain its head after a head trim", () => {
    const project = makeProject([main], [
      makeClip({ id: "a", start: 0, sourceIn: 0, sourceOut: 10 }),
    ]);
    const trimmed = trimClip(project, "a", "start", 4);
    expect(getClip(trimmed, "a").sourceIn).toBe(4);
    const restored = trimClip(trimmed, "a", "start", -4);
    expect(getClip(restored, "a")).toMatchObject({ start: 0, sourceIn: 0, sourceOut: 10 });
  });
});
