import { describe, expect, it } from "vitest";

import {
  MIN_BOX_SIZE,
  nodeToTransform,
  snapMove,
  stageBoxes,
  type StageBox,
} from "@/lib/editor/stage";
import { makeClip, makeProject, makeTrack } from "@/lib/timeline/test-utils";

const tracks = [
  makeTrack({ id: "o", type: "overlay", order: 0 }),
  makeTrack({ id: "v", type: "video", order: 1 }),
  makeTrack({ id: "a", type: "audio", order: 2 }),
];
const transform = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
});

describe("stageBoxes", () => {
  it("lists visible clips bottom first, using what is drawn", () => {
    const project = makeProject(tracks, [
      makeClip({
        id: "over",
        trackId: "o",
        kind: "image",
        sourceDuration: null,
        transform: transform(10, 20, 100, 50),
      }),
      makeClip({ id: "main", trackId: "v", transform: transform(0, 0, 1920, 1080) }),
    ]);
    const boxes = stageBoxes(project, 1);
    expect(boxes.map((b) => b.clipId)).toEqual(["main", "over"]);
    expect(boxes[1]).toMatchObject({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      locked: false,
      animated: false,
    });
  });

  it("leaves out audio, clips not playing now, and clips on hidden tracks", () => {
    const hidden = [
      makeTrack({ id: "o", type: "overlay", order: 0, hidden: true }),
      makeTrack({ id: "v", type: "video", order: 1 }),
      makeTrack({ id: "a", type: "audio", order: 2 }),
    ];
    const project = makeProject(hidden, [
      makeClip({ id: "h", trackId: "o", kind: "image", sourceDuration: null }),
      makeClip({ id: "later", trackId: "v", start: 50 }),
      makeClip({ id: "snd", trackId: "a", kind: "audio" }),
      makeClip({ id: "now", trackId: "v", start: 0 }),
    ]);
    expect(stageBoxes(project, 1).map((b) => b.clipId)).toEqual(["now"]);
  });

  it("marks locked clips, clips on locked tracks, and animated clips", () => {
    const lockedTrack = [
      makeTrack({ id: "o", type: "overlay", order: 0, locked: true }),
      makeTrack({ id: "v", type: "video", order: 1 }),
    ];
    const keyframe = { id: "k", time: 0, x: 0, y: 0, rotation: 0, opacity: 1 };
    const project = makeProject(lockedTrack, [
      makeClip({ id: "a", trackId: "o", kind: "image", sourceDuration: null }),
      makeClip({ id: "b", trackId: "v", locked: true }),
      makeClip({ id: "c", trackId: "v", start: 0, keyframes: [keyframe] }),
    ]);
    const byId = Object.fromEntries(stageBoxes(project, 1).map((b) => [b.clipId, b]));
    expect(byId.a.locked).toBe(true);
    expect(byId.b.locked).toBe(true);
    expect(byId.c.animated).toBe(true);
    expect(byId.c.locked).toBe(false);
  });
});

describe("nodeToTransform", () => {
  it("turns a stretched node back into a real size with scale 1", () => {
    expect(
      nodeToTransform({ x: 5, y: 6, rotation: 30, width: 100, height: 50, scaleX: 2, scaleY: 1.5 }),
    ).toEqual({ x: 5, y: 6, width: 200, height: 75, rotation: 30 });
  });

  it("never goes below the minimum size and ignores flipped scale signs", () => {
    const result = nodeToTransform({
      x: 0,
      y: 0,
      rotation: 0,
      width: 100,
      height: 100,
      scaleX: -0.01,
      scaleY: 0.01,
    });
    expect(result.width).toBe(MIN_BOX_SIZE);
    expect(result.height).toBe(MIN_BOX_SIZE);
  });
});

describe("snapMove", () => {
  const frame = { width: 1000, height: 600 };
  const box = (clipId: string, x: number, y: number, width: number, height: number): StageBox => ({
    clipId,
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    animated: false,
  });

  it("snaps to the frame's edges", () => {
    const result = snapMove({ id: "m", x: 3, y: 100, width: 100, height: 100 }, [], frame, 1);
    expect(result.x).toBe(0);
    expect(result.guides.some((g) => g.axis === "x" && g.position === 0)).toBe(true);
  });

  it("snaps to another box's edge", () => {
    const others = [box("other", 400, 300, 200, 100)];
    const result = snapMove({ id: "m", x: 603, y: 50, width: 100, height: 50 }, others, frame, 1);
    expect(result.x).toBe(600);
  });

  it("uses a tighter range when zoomed in and ignores excluded boxes", () => {
    const others = [box("other", 400, 300, 200, 100)];
    expect(snapMove({ id: "m", x: 606, y: 50, width: 100, height: 50 }, others, frame, 1).x).toBe(
      600,
    );
    // at 4x zoom the threshold is 1.5 frame units, so 6 away no longer snaps
    expect(snapMove({ id: "m", x: 606, y: 50, width: 100, height: 50 }, others, frame, 4).x).toBe(
      606,
    );
    expect(
      snapMove({ id: "m", x: 603, y: 50, width: 100, height: 50 }, others, frame, 1, ["other"]).x,
    ).toBe(603);
  });

  it("leaves the position alone when nothing is close", () => {
    const result = snapMove({ id: "m", x: 123, y: 77, width: 50, height: 40 }, [], frame, 1);
    expect(result).toMatchObject({ x: 123, y: 77, guides: [] });
  });
});
