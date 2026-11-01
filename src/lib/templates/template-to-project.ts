import { assetMediaId } from "@/lib/assets/asset-keys";
import { ASSET_CATALOG } from "@/lib/assets/asset-catalog";
import {
  addPlaceholder,
  addSticker,
  addText,
  patchTextAdjustments,
  setClipTransforms,
} from "@/lib/editor/ops";
import { emptyTimeline, type FrameSize } from "@/lib/sync/timeline-document";
import { updateClip } from "@/lib/timeline/clip-edits";
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { ScrapbookTemplate } from "@/types/template";
import { DEFAULT_TEXT_ADJUSTMENTS } from "@/types/text-adjustments";
import type { TimelineProject } from "@/types/timeline";

/** The page every template sits on: a sticker the size of the frame, at the very back. */
export const BACKGROUND_NAME = "Page";
const BACKGROUND_ASSET = ASSET_CATALOG.find((a) => a.category === "paperTextures" && a.name === "White paper");

/**
 * Builds a project from a template: its frame, a white page, and one overlay
 * clip per object, stacked in the template's order (later in front), all from
 * 0 s for the usual 5 s. Text becomes text clips, catalog art becomes stickers,
 * and tap-to-add slots become empty placeholder clips.
 */
export function templateToProject(
  template: ScrapbookTemplate,
  projectId: string,
  newId: IdFn = createId,
): { project: TimelineProject; frame: FrameSize } {
  const frame = template.frame;
  let project = emptyTimeline(projectId, newId);

  const place = (
    result: { project: TimelineProject; clipId: string },
    name: string | undefined,
    box: { x: number; y: number; width: number; height: number; rotation?: number },
  ) => {
    const next = setClipTransforms(result.project, {
      [result.clipId]: { x: box.x, y: box.y, width: box.width, height: box.height, rotation: box.rotation ?? 0 },
    });
    // Text clips keep the short name editing gives them; the others take the template's name.
    return name === undefined ? next : updateClip(next, result.clipId, { name });
  };

  if (BACKGROUND_ASSET) {
    const page = addSticker(
      project,
      { mediaId: assetMediaId(BACKGROUND_ASSET), name: BACKGROUND_NAME, width: frame.width, height: frame.height },
      frame,
      0,
      newId,
    );
    project = place(page, BACKGROUND_NAME, { x: 0, y: 0, width: frame.width, height: frame.height });
    // Locked, so it neither catches clicks meant for the empty paper nor gets dragged away.
    project = updateClip(project, page.clipId, { locked: true });
  }

  for (const object of template.objects) {
    if (object.placeholder) {
      const slot = addPlaceholder(
        project,
        object.name,
        { x: object.x, y: object.y, width: object.width, height: object.height, rotation: object.rotation ?? 0 },
        0,
        newId,
      );
      project = slot.project;
      continue;
    }

    if (object.type === "text") {
      const text = addText(project, frame, 0, newId);
      // The template's own text settings over the stock style (not the studio's white default).
      project = patchTextAdjustments(text.project, text.clipId, { ...DEFAULT_TEXT_ADJUSTMENTS, ...object.text });
      project = place({ project, clipId: text.clipId }, undefined, object);
      continue;
    }

    const asset = ASSET_CATALOG.find((a) => a.src === object.src);
    if (!asset) {
      // Art that is not in the catalog cannot be a sticker: keep the spot as an empty slot.
      const slot = addPlaceholder(
        project,
        object.name,
        { x: object.x, y: object.y, width: object.width, height: object.height, rotation: object.rotation ?? 0 },
        0,
        newId,
      );
      project = slot.project;
      continue;
    }
    const sticker = addSticker(
      project,
      { mediaId: assetMediaId(asset), name: object.name, width: asset.width, height: asset.height },
      frame,
      0,
      newId,
    );
    project = place(sticker, object.name, object);
  }

  return { project, frame };
}
