import { describe, expect, it } from "vitest";

import { addToSequence, type EditorMedia } from "@/lib/editor/ops";
import { addText, TEXT_STYLES } from "@/lib/editor/text-ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { refitToFrame } from "@/lib/timeline/refit";
import { seqIds } from "@/lib/timeline/test-utils";

const landscape = { width: 1920, height: 1080 };
const portrait = { width: 1080, height: 1920 };
const photo = (w: number, h: number): EditorMedia => ({ mediaId: "p", name: "p", kind: "image", duration: 5, width: w, height: h });

describe("refitToFrame", () => {
  it("keeps a fitted photo fitted and centred in the new shape", () => {
    const { project, clipId } = addToSequence(emptyTimeline("p", seqIds("t")), photo(1600, 1200), landscape, seqIds("c"));
    const t = refitToFrame(project, landscape, portrait).clips.find((c) => c.id === clipId)!.transform;
    expect(t.width).toBeCloseTo(1080);
    expect(t.height).toBeCloseTo(810);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo((1920 - 810) / 2);
  });

  it("keeps a photo that fills the frame filling it", () => {
    const base = addToSequence(emptyTimeline("p", seqIds("t")), photo(1920, 1080), landscape, seqIds("c"));
    const t = refitToFrame(base.project, landscape, portrait).clips[0].transform;
    // Exactly the frame is both fitted and filling; fitted wins, so it sits centred across the width.
    expect(t.width).toBeCloseTo(1080);
    expect(t.y + t.height / 2).toBeCloseTo(960);
  });

  it("keeps a moved picture in the same place relative to the frame", () => {
    const base = addToSequence(emptyTimeline("p", seqIds("t")), photo(400, 400), landscape, seqIds("c"));
    const moved = { ...base.project, clips: base.project.clips.map((c) => ({ ...c, transform: { ...c.transform, x: 0, y: 0, width: 480, height: 480 } })) };
    const t = refitToFrame(moved, landscape, portrait).clips[0].transform;
    expect(t.width).toBeCloseTo(270); // scaled by the smaller side's change
    expect((t.x + t.width / 2) / 1080).toBeCloseTo(240 / 1920);
    expect((t.y + t.height / 2) / 1920).toBeCloseTo(240 / 1080);
  });

  it("keeps a title centred and sized for the new frame", () => {
    const style = TEXT_STYLES.find((s) => s.id === "title");
    const { project, clipId } = addText(emptyTimeline("p", seqIds("t")), landscape, 0, { content: "Hi", style }, seqIds("x"));
    const before = project.clips.find((c) => c.id === clipId)!;
    const after = refitToFrame(project, landscape, portrait).clips.find((c) => c.id === clipId)!;
    expect(after.transform.x + after.transform.width / 2).toBeCloseTo(540);
    expect(after.transform.width / 1080).toBeCloseTo(before.transform.width / 1920);
    expect(after.transform.y + after.transform.height).toBeLessThanOrEqual(1920);
    expect(after.adjustments.text!.fontSize).toBe(before.adjustments.text!.fontSize); // same area
  });

  it("changes nothing when the shape is the same", () => {
    const { project } = addToSequence(emptyTimeline("p", seqIds("t")), photo(10, 10), landscape, seqIds("c"));
    expect(refitToFrame(project, landscape, { ...landscape })).toBe(project);
  });
});
