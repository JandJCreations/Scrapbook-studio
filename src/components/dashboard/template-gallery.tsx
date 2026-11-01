"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { TemplateCard } from "@/components/dashboard/template-card";
import { createClient } from "@/lib/supabase/client";
import { saveProjectFrameChecked } from "@/lib/sync/project-frame";
import { createSupabaseTimelineStorage } from "@/lib/sync/supabase-timeline-storage";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { writeTemplateProject } from "@/lib/templates/write-template-project";
import { useProjectStore } from "@/store/use-project-store";
import type { ScrapbookTemplate } from "@/types/template";

export function TemplateGallery() {
  const router = useRouter();
  const createProject = useProjectStore((s) => s.createProject);

  async function handleUse(template: ScrapbookTemplate) {
    try {
      const project = await createProject(template.name);
      const client = createClient();
      try {
        await writeTemplateProject({
          storage: createSupabaseTimelineStorage(client),
          saveFrame: (frame) => saveProjectFrameChecked(client, project.id, frame),
          template,
          projectId: project.id,
        });
        toast.success(`"${template.name}" created`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `"${template.name}" was created, but its layout could not be saved: ${error.message}`
            : `"${template.name}" was created, but its layout could not be saved.`,
        );
      }
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
