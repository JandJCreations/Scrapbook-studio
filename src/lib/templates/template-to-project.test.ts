import { describe, expect, it } from "vitest";

import { assetMediaId, findAssetByMediaId } from "@/lib/assets/asset-keys";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { BACKGROUND_NAME, templateToProject } from "@/lib/templates/template-to-project";
import { clipEnd } from "@/lib/timeline/clip-math";
import { seqIds } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

const orderOf = (project: TimelineProject, trackId: string) =>
  project.tracks.find((t) => t.id === trackId)!.order;

describe("templateToProject", () => {
  it.each(TEMPLATE_CATALOG.map((t) => [t.name, t] as const))(
    "turns %s into clips with its frame",
    (_name, template) => {
      const { project, frame } = templateToProject(template, "p1", seqIds("n"));
      expect(frame).toEqual(template.frame);
      expect(project.id).toBe("p1");
      // The page background plus one clip per object.
      expect(project.clips).toHaveLength(template.objects.length + 1);
      for (const clip of project.clips) {
        expect(clip.start).toBe(0);
        expect(clipEnd(clip)).toBe(5);
        expect(project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
      }
      // The main video track and an audio track are there, empty.
      expect(project.tracks.map((t) => t.type).sort()).toContain("video");
      expect(project.tracks.map((t) => t.type).sort()).toContain("audio");
    },
  );

  it("puts a paper page behind everything, the size of the frame", () => {
    const template = TEMPLATE_CATALOG[0];
    const { project } = templateToProject(template, "p1", seqIds("n"));
    const background = project.clips.find((c) => c.name === BACKGROUND_NAME)!;
    expect(background).toMatchObject({ kind: "sticker", mediaId: "asset:paperTextures/White paper" });
    expect(background.transform).toMatchObject({ x: 0, y: 0, ...template.frame });
    const backOrder = orderOf(project, background.trackId);
    for (const clip of project.clips.filter((c) => c !== background)) {
      expect(orderOf(project, clip.trackId)).toBeLessThan(backOrder);
    }
  });

  it("stacks the objects in the template's order, later ones in front", () => {
    const template = TEMPLATE_CATALOG[0];
    const { project } = templateToProject(template, "p1", seqIds("n"));
    // Clips are added in order, the page first.
    const orders = template.objects.map((_, i) => orderOf(project, project.clips[i + 1].trackId));
    for (let i = 1; i < orders.length; i++) expect(orders[i]).toBeLessThan(orders[i - 1]);
  });

  it("makes text clips from the template's words, box and style", () => {
    const template = TEMPLATE_CATALOG[0]; // Birthday Bash
    const { project } = templateToProject(template, "p1", seqIds("n"));
    const def = template.objects.find((o) => o.type === "text" && o.name === "Title")!;
    const clip = project.clips.find((c) => c.name === "Happy Birthday!")!;
    expect(clip.kind).toBe("text");
    expect(clip.adjustments.text).toMatchObject({
      content: "Happy Birthday!",
      fontSize: 72,
      fontWeight: 800,
      color: "#1f2937",
    });
    expect(clip.transform).toMatchObject({ x: def.x, y: def.y, width: def.width, height: def.height });
  });

  it("makes stickers of catalog art, keeping the template's box and tilt", () => {
    const template = TEMPLATE_CATALOG[0];
    const def = template.objects.find((o) => o.name === "Washi tape")!;
    const { project } = templateToProject(template, "p1", seqIds("n"));
    const clip = project.clips.find((c) => c.name === "Washi tape")!;
    expect(clip.kind).toBe("sticker");
    expect(findAssetByMediaId(clip.mediaId)?.src).toBe(def.src);
    expect(clip.transform).toMatchObject({ x: def.x, y: def.y, width: def.width, height: def.height, rotation: -20 });
  });

  it("turns tap-to-add slots into empty placeholder clips", () => {
    const slots = TEMPLATE_CATALOG.flatMap((t) => t.objects.filter((o) => o.placeholder));
    expect(slots.length).toBeGreaterThan(0);
    for (const template of TEMPLATE_CATALOG.filter((t) => t.objects.some((o) => o.placeholder))) {
      const { project } = templateToProject(template, "p1", seqIds("n"));
      const slotClips = project.clips.filter((c) => c.isPlaceholder);
      expect(slotClips).toHaveLength(template.objects.filter((o) => o.placeholder).length);
      for (const clip of slotClips) {
        expect(clip).toMatchObject({ kind: "image", mediaId: "", sourceDuration: null });
      }
    }
  });

  it("never leaves a non-slot image without art", () => {
    for (const template of TEMPLATE_CATALOG) {
      const { project } = templateToProject(template, "p1", seqIds("n"));
      for (const clip of project.clips.filter((c) => c.kind === "sticker")) {
        expect(findAssetByMediaId(clip.mediaId)).toBeDefined();
        expect(clip.mediaId).toBe(assetMediaId(findAssetByMediaId(clip.mediaId)!));
      }
    }
  });
});
