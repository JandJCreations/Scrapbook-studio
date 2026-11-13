import { describe, expect, it } from "vitest";

import { hasMediaDrag, MEDIA_DRAG_TYPE, mediaDragKind, readMediaDrag, writeMediaDrag } from "@/lib/dom/media-drag";

/** The part of a DataTransfer these helpers use. */
function fakeTransfer(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    types: Object.keys(data),
    effectAllowed: "none",
    setData(type: string, value: string) {
      data[type] = value;
      this.types = Object.keys(data);
    },
    getData: (type: string) => data[type] ?? "",
  };
}

describe("media drag payloads", () => {
  it("round-trips a library item and a built-in track", () => {
    const transfer = fakeTransfer();
    writeMediaDrag(transfer, { source: "library", id: "abc" }, "visual");
    expect(transfer.effectAllowed).toBe("copy");
    expect(hasMediaDrag(transfer)).toBe(true);
    expect(readMediaDrag(transfer)).toEqual({ source: "library", id: "abc" });

    const music = fakeTransfer();
    writeMediaDrag(music, { source: "music", id: "golden-hour" }, "audio");
    expect(readMediaDrag(music)).toEqual({ source: "music", id: "golden-hour" });
  });

  it("knows a drag that is not ours (a file, text, a clip being moved)", () => {
    expect(hasMediaDrag(fakeTransfer({ "text/plain": "hello" }))).toBe(false);
    expect(readMediaDrag(fakeTransfer({ "text/plain": "hello" }))).toBeNull();
  });

  it("ignores a payload that is damaged or the wrong shape", () => {
    expect(readMediaDrag(fakeTransfer({ [MEDIA_DRAG_TYPE]: "{not json" }))).toBeNull();
    expect(readMediaDrag(fakeTransfer({ [MEDIA_DRAG_TYPE]: JSON.stringify({ source: "web", id: "x" }) }))).toBeNull();
    expect(readMediaDrag(fakeTransfer({ [MEDIA_DRAG_TYPE]: JSON.stringify({ source: "library" }) }))).toBeNull();
  });
});

describe("the kind of what is dragged", () => {
  it("is readable while dragging over, so a lane can say whether it accepts it", () => {
    const photo = fakeTransfer();
    writeMediaDrag(photo, { source: "library", id: "a" }, "visual");
    expect(mediaDragKind(photo)).toBe("visual");
    const song = fakeTransfer();
    writeMediaDrag(song, { source: "music", id: "m" }, "audio");
    expect(mediaDragKind(song)).toBe("audio");
    expect(mediaDragKind(fakeTransfer({ "text/plain": "x" }))).toBeNull();
  });
});
