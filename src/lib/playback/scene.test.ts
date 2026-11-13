import { describe, expect, it } from "vitest";

import { buildScene, fitContain, fitFrame } from "@/lib/playback/scene";
import { FakeElement } from "@/lib/playback/test-utils";
import { makeClip, makeProject, makeStandardTracks, makeTrack } from "@/lib/timeline/test-utils";
import { DEFAULT_PHOTO_ADJUSTMENTS } from "@/types/photo-adjustments";
import type { TextAdjustments } from "@/types/text-adjustments";

const none = () => undefined;

describe("buildScene", () => {
  it("is empty when nothing is active", () => {
    expect(buildScene(makeProject(makeStandardTracks(), []), 1, none)).toEqual([]);
  });

  it("lists active clips in paint order, bottom track first", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "over", trackId: "t2", kind: "image", sourceDuration: null }),
      makeClip({ id: "main", trackId: "t1" }),
    ]);
    expect(buildScene(project, 1, none).map((item) => item.clipId)).toEqual(["main", "over"]);
  });

  it("omits audio clips and clips on hidden tracks", () => {
    const tracks = [
      makeTrack({ id: "t1", type: "video", order: 0, hidden: true }),
      makeTrack({ id: "t2", type: "overlay", order: 1 }),
      makeTrack({ id: "t3", type: "audio", order: 2 }),
    ];
    const project = makeProject(tracks, [
      makeClip({ id: "hidden", trackId: "t1" }),
      makeClip({ id: "shown", trackId: "t2", kind: "image", sourceDuration: null }),
      makeClip({ id: "sound", trackId: "t3", kind: "audio" }),
    ]);
    expect(buildScene(project, 1, none).map((item) => item.clipId)).toEqual(["shown"]);
  });

  it("gives a video clip its own element and never another clip's", () => {
    const a = new FakeElement();
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", trackId: "t1" }),
      makeClip({ id: "b", trackId: "t2" }),
    ]);
    const scene = buildScene(project, 1, (clipId) => (clipId === "a" ? a : undefined));
    expect(scene.find((item) => item.clipId === "a")?.content).toEqual({ type: "video", element: a });
    expect(scene.find((item) => item.clipId === "b")?.content).toBeNull();
  });

  it("describes image, text and sticker clips", () => {
    const text = { content: "Hello" } as unknown as TextAdjustments;
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "img", trackId: "t2", kind: "image", mediaId: "m9", sourceDuration: null }),
      makeClip({
        id: "txt",
        trackId: "t2",
        kind: "text",
        name: "Title",
        sourceDuration: null,
        adjustments: { photo: null, video: null, text },
      }),
      makeClip({ id: "txt2", trackId: "t2", kind: "text", name: "Fallback", sourceDuration: null }),
      makeClip({ id: "stk", trackId: "t2", kind: "sticker", name: "Star", mediaId: "", sourceDuration: null }),
    ]);
    const byId = Object.fromEntries(buildScene(project, 1, none).map((i) => [i.clipId, i.content]));
    expect(byId.img).toEqual({ type: "image", mediaId: "m9" });
    expect(byId.txt).toEqual({ type: "text", adjustments: text });
    expect(byId.txt2).toEqual({ type: "placeholder", label: "Fallback" });
    expect(byId.stk).toEqual({ type: "placeholder", label: "Star" });
  });

  it("draws a sticker of bundled art as a picture, and a sticker with no art as a placeholder", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "art", trackId: "t2", kind: "sticker", mediaId: "asset:stickers/Star", sourceDuration: null }),
    ]);
    const art = buildScene(project, 1, none)[0];
    expect(art.content).toEqual({ type: "image", mediaId: "asset:stickers/Star" });
    expect(art.look).toBeNull();
  });

  it("draws a sticker made from one of the user's own pictures as that picture", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "mine", trackId: "t2", kind: "sticker", mediaId: "11111111-1111-4111-8111-111111111111", sourceDuration: null }),
    ]);
    expect(buildScene(project, 1, none)[0].content).toEqual({ type: "image", mediaId: "11111111-1111-4111-8111-111111111111" });
  });

  it("carries the look of an adjusted picture and nothing for a plain one", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({
        id: "bright",
        trackId: "t2",
        kind: "image",
        sourceDuration: null,
        adjustments: {
          photo: { ...DEFAULT_PHOTO_ADJUSTMENTS, brightness: 20 },
          video: null,
          text: null,
        },
      }),
      makeClip({ id: "plain", trackId: "t2", kind: "image", sourceDuration: null }),
    ]);
    const byId = Object.fromEntries(buildScene(project, 1, none).map((i) => [i.clipId, i.look]));
    expect(byId.bright?.filter).toBe("brightness(1.2)");
    expect(byId.plain).toBeNull();
  });

  it("draws an empty slot as a labelled stand-in, never as its (missing) media", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "slot", trackId: "t2", kind: "image", name: "Photo 1", mediaId: "", sourceDuration: null, isPlaceholder: true }),
    ]);
    expect(buildScene(project, 1, none)[0].content).toEqual({ type: "placeholder", label: "Photo 1" });
  });

  it("uses the clip's local time for keyframes and fades", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({
        id: "a",
        start: 10,
        sourceOut: 10,
        fadeIn: 2,
        transform: { x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1 },
      }),
    ]);
    const [item] = buildScene(project, 11, none);
    expect(item.draw.opacity).toBeCloseTo(0.5, 9);
    expect(item.draw.width).toBe(100);
  });

  it("includes a visible but muted video", () => {
    const project = makeProject(makeStandardTracks(), [makeClip({ id: "a", muted: true })]);
    expect(buildScene(project, 1, none)).toHaveLength(1);
  });
});

describe("fitFrame", () => {
  it("scales uniformly and centres the frame in the container", () => {
    expect(fitFrame(800, 600, 1600, 900)).toEqual({ scale: 0.5, x: 0, y: 75 });
    expect(fitFrame(2000, 450, 1600, 900)).toEqual({ scale: 0.5, x: 600, y: 0 });
  });

  it("falls back to identity for non-positive sizes", () => {
    expect(fitFrame(0, 600, 1600, 900)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(fitFrame(800, 600, 0, 900)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("fitContain", () => {
  it("fills the frame when the aspect ratio matches", () => {
    expect(fitContain(640, 360, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it("letterboxes a square into a wide frame", () => {
    expect(fitContain(1000, 1000, 1280, 720)).toEqual({ x: 280, y: 0, width: 720, height: 720 });
  });

  it("scales small media up to fit", () => {
    expect(fitContain(160, 90, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it("uses the whole frame when the natural size is unknown", () => {
    expect(fitContain(0, 0, 1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });
});

describe("buildScene during a transition", () => {
  const frame = { width: 1920, height: 1080 };
  const photo = (id: string, start: number, extra = {}) =>
    makeClip({ id, trackId: "t1", kind: "image", sourceDuration: null, start, sourceIn: 0, sourceOut: 4, ...extra });
  const project = (transition: { type: "fade" | "dip" | "slide-left" | "slide-right"; duration: number }) =>
    makeProject(makeStandardTracks(), [photo("a", 0), photo("b", 4, { transition })]);

  it("shows only the current clip outside the transition", () => {
    const p = project({ type: "fade", duration: 1 });
    expect(buildScene(p, 2.9, none, frame).map((i) => i.clipId)).toEqual(["a"]);
    expect(buildScene(p, 4, none, frame).map((i) => i.clipId)).toEqual(["b"]);
  });

  it("draws the arriving clip under the leaving one while they cross", () => {
    const items = buildScene(project({ type: "fade", duration: 1 }), 3.5, none, frame);
    expect(items.map((i) => i.clipId)).toEqual(["b", "a"]);
    expect(items[1].draw.opacity).toBeCloseTo(0.5);
    expect(items[0].draw.opacity).toBe(1);
  });

  it("slides both clips by the frame's width", () => {
    const items = buildScene(project({ type: "slide-left", duration: 1 }), 3.5, none, frame);
    const byId = Object.fromEntries(items.map((i) => [i.clipId, i.draw.x]));
    const home = items.find((i) => i.clipId === "a")!.draw.x + 0.5 * frame.width;
    expect(byId.a).toBeCloseTo(home - 0.5 * frame.width);
    expect(byId.b).toBeCloseTo(home + 0.5 * frame.width);
  });

  it("holds the arriving video's first frame: it draws the element it is given", () => {
    const element = new FakeElement();
    const video = makeProject(makeStandardTracks(), [
      photo("a", 0),
      makeClip({ id: "v", trackId: "t1", kind: "video", start: 4, sourceIn: 0, sourceOut: 4, transition: { type: "fade", duration: 1 } }),
    ]);
    const items = buildScene(video, 3.5, (id) => (id === "v" ? element : undefined), frame);
    expect(items.find((i) => i.clipId === "v")?.content).toEqual({ type: "video", element });
  });

  it("does nothing without a transition on the clip", () => {
    const plain = makeProject(makeStandardTracks(), [photo("a", 0), photo("b", 4)]);
    expect(buildScene(plain, 3.5, none, frame).map((i) => i.clipId)).toEqual(["a"]);
  });

  it("lets the arriving clip show through even if it fades in at its start", () => {
    const p = makeProject(makeStandardTracks(), [
      photo("a", 0),
      photo("b", 4, { fadeIn: 2, transition: { type: "fade", duration: 1 } }),
    ]);
    const items = buildScene(p, 3.5, none, frame);
    expect(items.find((i) => i.clipId === "b")?.draw.opacity).toBe(1);
  });

  it("plays the transitions of two tracks at once", () => {
    const p = makeProject(makeStandardTracks(), [
      photo("a", 0),
      photo("b", 4, { transition: { type: "fade", duration: 1 } }),
      photo("c", 0, { trackId: "t2" }),
      photo("d", 4, { trackId: "t2", transition: { type: "fade", duration: 1 } }),
    ]);
    const ids = buildScene(p, 3.5, none, frame).map((i) => i.clipId);
    expect(ids).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
    expect(ids).toHaveLength(4);
  });
});

describe("buildScene item layout", () => {
  it("says how wide the clip is laid out, so a zoom does not change what the painter caches by", () => {
    const motionPhoto = makeClip({
      id: "m",
      trackId: "t1",
      kind: "image",
      sourceDuration: null,
      sourceOut: 4,
      transform: { x: 0, y: 0, width: 400, height: 300, rotation: 0, opacity: 1 },
      motion: "zoom-in",
    });
    const project = makeProject(makeStandardTracks(), [motionPhoto]);
    const early = buildScene(project, 0, none)[0];
    const late = buildScene(project, 3.5, none)[0];
    expect(late.draw.width).toBeGreaterThan(early.draw.width);
    expect(early.layoutWidth).toBe(400);
    expect(late.layoutWidth).toBe(400);
  });
});
