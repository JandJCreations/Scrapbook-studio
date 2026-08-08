"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { TemplateCard } from "@/components/dashboard/template-card";
import { markProjectContentLoaded } from "@/hooks/use-project-content-sync";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { saveProjectFrame } from "@/lib/sync/project-content-sync";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useCanvasFrameStore } from "@/store/use-canvas-frame-store";
import { useProjectStore } from "@/store/use-project-store";
import type { ScrapbookTemplate } from "@/types/template";

export function TemplateGallery() {
  const router = useRouter();
  const createProject = useProjectStore((s) => s.createProject);
  const setFrame = useCanvasFrameStore((s) => s.setFrame);
  const addObject = useCanvasStore((s) => s.addObject);
  const updateObject = useCanvasStore((s) => s.updateObject);
  const updateTextAdjustments = useCanvasStore((s) => s.updateTextAdjustments);

  async function handleUse(template: ScrapbookTemplate) {
    try {
      const project = await createProject(template.name);
      setFrame(project.id, template.frame);
      saveProjectFrame(project.id, template.frame).catch((error) => {
        console.error("Failed to save canvas frame:", error);
      });

      for (const obj of template.objects) {
        const newId = addObject(project.id, {
          type: obj.type,
          mediaId: `template-${template.id}-${obj.name}`,
          src: obj.src,
          name: obj.name,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
        });
        if (obj.rotation) {
          updateObject(project.id, newId, { rotation: obj.rotation });
        }
        if (obj.text) {
          updateTextAdjustments(project.id, newId, obj.text);
        }
      }

      // The editor's autosave will persist these objects shortly after mount;
      // mark content as already "loaded" so it doesn't fetch (still-empty) DB
      // rows and overwrite what we just built locally.
      markProjectContentLoaded(project.id);

      toast.success(`"${template.name}" created`);
      router.push(`/editor/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create project");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {TEMPLATE_CATALOG.map((template) => (
        <TemplateCard key={template.id} template={template} onUse={handleUse} />
      ))}
    </div>
  );
}
