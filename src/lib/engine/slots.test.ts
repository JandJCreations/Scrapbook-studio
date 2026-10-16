import { describe, expect, it } from "vitest";

import { assignSlots, MAX_VIDEO_SLOTS, type SlotState } from "@/lib/engine/slots";
import type { WantedMedia } from "@/lib/engine/wanted";

const w = (clipId: string, overrides: Partial<WantedMedia> = {}): WantedMedia => ({
  clipId,
  mediaId: "m",
  kind: "video",
  active: true,
  targetTime: 0,
  playbackRate: 1,
  reversed: false,
  shouldPlay: true,
  gain: 1,
  ...overrides,
});

const slot = (id: string, overrides: Partial<SlotState> = {}): SlotState => ({
  id,
  kind: "video",
  mediaId: "m",
  clipId: null,
  currentTime: 0,
  ...overrides,
});

const slotOf = (result: ReturnType<typeof assignSlots>, clipId: string) =>
  result.assignments.find((a) => a.wanted.clipId === clipId)?.slotId;

describe("assignSlots: reuse", () => {
  it("keeps a clip on the slot it already owns", () => {
    const result = assignSlots([w("c1")], [slot("s1", { clipId: "c1", currentTime: 5 })]);
    expect(slotOf(result, "c1")).toBe("s1");
    expect(result.releasedSlotIds).toEqual([]);
  });

  it("reuses the free slot of the same file that is nearest the target", () => {
    const slots = [slot("s1", { currentTime: 1 }), slot("s2", { currentTime: 9 })];
    const result = assignSlots([w("c1", { targetTime: 8.5 })], slots);
    expect(slotOf(result, "c1")).toBe("s2");
    expect(result.releasedSlotIds).toEqual(["s1"]);
  });

  it("prefers a free slot of the same file over one holding another file", () => {
    const slots = [slot("s1", { mediaId: "other" }), slot("s2", { currentTime: 50 })];
    expect(slotOf(assignSlots([w("c1")], slots), "c1")).toBe("s2");
  });

  it("uses a free slot holding another file before creating a new one", () => {
    const result = assignSlots([w("c1")], [slot("s1", { mediaId: "other" })]);
    expect(slotOf(result, "c1")).toBe("s1");
  });

  it("prefers an empty slot over one holding another file", () => {
    const slots = [slot("s1", { mediaId: "other" }), slot("s2", { mediaId: null })];
    expect(slotOf(assignSlots([w("c1")], slots), "c1")).toBe("s2");
  });

  it("hands the slot of a clip that is no longer wanted to the clip that continues it", () => {
    const result = assignSlots(
      [w("b", { targetTime: 4 })],
      [slot("s1", { clipId: "a", currentTime: 4.02 })],
    );
    expect(slotOf(result, "b")).toBe("s1");
    expect(result.releasedSlotIds).toEqual([]);
  });
});

describe("assignSlots: creating and releasing", () => {
  it("asks for a new slot when none is free", () => {
    expect(slotOf(assignSlots([w("c1")], []), "c1")).toBeNull();
  });

  it("gives two simultaneous clips of one file two slots", () => {
    const result = assignSlots([w("a"), w("b")], [slot("s1", { clipId: "a" })]);
    expect(slotOf(result, "a")).toBe("s1");
    expect(slotOf(result, "b")).toBeNull();
  });

  it("does not let a preload take a slot owned by another wanted preload", () => {
    const result = assignSlots(
      [w("p1", { active: false }), w("p2", { active: false })],
      [slot("s1", { clipId: "p1" })],
    );
    expect(slotOf(result, "p1")).toBe("s1");
    expect(slotOf(result, "p2")).toBeNull();
  });

  it("releases slots nothing wants", () => {
    const result = assignSlots([], [slot("s1", { clipId: "gone" }), slot("s2")]);
    expect(result.releasedSlotIds).toEqual(["s1", "s2"]);
  });

  it("never mixes audio and video slots", () => {
    const result = assignSlots([w("v")], [slot("a1", { kind: "audio" })]);
    expect(slotOf(result, "v")).toBeNull();
    expect(result.releasedSlotIds).toEqual(["a1"]);
  });
});

describe("assignSlots: the video cap", () => {
  const owned = (ids: string[]) =>
    ids.map((id, i) => slot(`s${i + 1}`, { mediaId: id, clipId: id }));

  it("exports the cap from the spec", () => {
    expect(MAX_VIDEO_SLOTS).toBe(6);
  });

  it("never requests more than the cap of video slots", () => {
    const wanted = Array.from({ length: 10 }, (_, i) => w(`c${i}`, { mediaId: `m${i}` }));
    const result = assignSlots(wanted, []);
    const created = result.assignments.filter((a) => a.slotId === null);
    expect(created).toHaveLength(6);
    expect(result.droppedClipIds).toEqual(["c6", "c7", "c8", "c9"]);
  });

  it("does not cap audio slots", () => {
    const wanted = Array.from({ length: 10 }, (_, i) =>
      w(`c${i}`, { kind: "audio", mediaId: `m${i}` }),
    );
    const result = assignSlots(wanted, []);
    expect(result.assignments).toHaveLength(10);
    expect(result.droppedClipIds).toEqual([]);
  });

  it("never drops an active clip in favour of a preload", () => {
    const slots = owned(["p1", "p2", "p3", "p4", "p5", "p6"]);
    const wanted = [
      w("X", { mediaId: "x" }),
      ...["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => w(id, { mediaId: id, active: false })),
    ];
    const result = assignSlots(wanted, slots);
    expect(slotOf(result, "X")).toBe("s6"); // took the lowest-priority preload's slot
    expect(result.droppedClipIds).toEqual(["p6"]);
    expect(result.releasedSlotIds).toEqual([]);
  });

  it("drops a preload when every slot belongs to an active clip", () => {
    const ids = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const wanted = [...ids.map((id) => w(id, { mediaId: id })), w("p", { mediaId: "p", active: false })];
    const result = assignSlots(wanted, owned(ids));
    expect(result.droppedClipIds).toEqual(["p"]);
    for (const id of ids) expect(slotOf(result, id)).not.toBeNull();
  });
});
