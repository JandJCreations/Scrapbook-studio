import { markProjectContentLoaded } from "@/hooks/use-project-content-sync";
import { saveProjectFrame } from "@/lib/sync/project-content-sync";
import type { AddObjectInput } from "@/store/use-canvas-store";
import type { CanvasObject } from "@/types/canvas";
import type { ScrapbookTemplate } from "@/types/template";
import type { TextAdjustments } from "@/types/text-adjustments";

interface ApplyTemplateActions {
  setFrame: (projectId: string, frame: { width: number; height: number }) => void;
  addObject: (projectId: string, input: AddObjectInput) => string;
  updateObject: (projectId: string, objectId: string, patch: Partial<CanvasObject>) => void;
  updateTextAdjustments: (
    projectId: string,
    objectId: string,
    patch: Partial<TextAdjustments>,
  ) => void;
}

/**
 * Applies a template's frame + pre-placed objects to an already-created
 * project. Shared by the Templates gallery and the "New project" dialog's
 * format picker so both paths build a project the exact same way.
 */
export function applyTemplateToProject(
  projectId: string,
  template: ScrapbookTemplate,
  actions: ApplyTemplateActions,
) {
  actions.setFrame(projectId, template.frame);
  saveProjectFrame(projectId, template.frame).catch((error) => {
    console.error("Failed to save canvas frame:", error);
  });

  for (const obj of template.objects) {
    const newId = actions.addObject(projectId, {
      type: obj.type,
      mediaId: obj.placeholder ? undefined : `template-${template.id}-${obj.name}`,
      src: obj.placeholder ? undefined : obj.src,
      name: obj.name,
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      isPlaceholder: obj.placeholder,
    });
    if (obj.rotation) {
      actions.updateObject(projectId, newId, { rotation: obj.rotation });
    }
    if (obj.text) {
      actions.updateTextAdjustments(projectId, newId, obj.text);
    }
  }

  // The editor's autosave will persist these objects shortly after mount;
  // mark content as already "loaded" so it doesn't fetch (still-empty) DB
  // rows and overwrite what we just built locally.
  markProjectContentLoaded(projectId);
}
