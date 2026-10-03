"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { TemplateCard } from "@/components/dashboard/template-card";
import { applyTemplateToProject } from "@/lib/templates/apply-template";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
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
      applyTemplateToProject(project.id, template, {
        setFrame,
        addObject,
        updateObject,
        updateTextAdjustments,
      });

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
