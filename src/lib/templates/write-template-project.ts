import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import { templateToProject } from "@/lib/templates/template-to-project";
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { ScrapbookTemplate } from "@/types/template";

/**
 * Puts a template into a brand-new project: its frame size, then its clips as
 * the project's timeline (revision 0, so it fails rather than overwrite a
 * project that already has content). The frame goes first, so a failure
 * between the two leaves a plain empty project, never a half-built one.
 */
export async function writeTemplateProject(options: {
  storage: TimelineStorage;
  saveFrame(frame: FrameSize): Promise<void>;
  template: ScrapbookTemplate;
  projectId: string;
  newId?: IdFn;
}): Promise<void> {
  const { storage, saveFrame, template, projectId, newId = createId } = options;
  const { project, frame } = templateToProject(template, projectId, newId);
  await saveFrame(frame);
  const result = await storage.save(projectId, project, 0);
  if (!result.ok) throw new Error("This project already has content.");
}
