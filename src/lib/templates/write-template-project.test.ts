import { describe, expect, it, vi } from "vitest";

import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { writeTemplateProject } from "@/lib/templates/write-template-project";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const template = TEMPLATE_CATALOG[0];

describe("writeTemplateProject", () => {
  it("saves the template as the project's timeline and its frame size", async () => {
    const storage = createMemoryTimelineStorage();
    const saveFrame = vi.fn(async () => {});
    await writeTemplateProject({ storage, saveFrame, template, projectId: "p1" });
    const loaded = await storage.load("p1");
    expect(loaded.rev).toBe(1);
    expect(loaded.project.clips.length).toBe(template.objects.length + 1);
    expect(saveFrame).toHaveBeenCalledWith(template.frame);
  });

  it("saves the frame size before the content, so a failure leaves a plain empty project", async () => {
    const storage = createMemoryTimelineStorage();
    const order: string[] = [];
    const save = storage.save.bind(storage);
    storage.save = async (...args) => {
      order.push("timeline");
      return save(...args);
    };
    await writeTemplateProject({
      storage,
      saveFrame: async () => void order.push("frame"),
      template,
      projectId: "p1",
    });
    expect(order).toEqual(["frame", "timeline"]);
  });

  it("does not leave content behind when the frame cannot be saved", async () => {
    const storage = createMemoryTimelineStorage();
    await expect(
      writeTemplateProject({
        storage,
        saveFrame: async () => {
          throw new Error("offline");
        },
        template,
        projectId: "p1",
      }),
    ).rejects.toThrow("offline");
    expect((await storage.load("p1")).rev).toBe(0);
  });

  it("refuses to overwrite a project that already has content", async () => {
    const storage = createMemoryTimelineStorage();
    await storage.save("p1", { ...makeProject(makeStandardTracks(), [makeClip({ id: "a" })]), id: "p1" }, 0);
    const saveFrame = vi.fn(async () => {});
    await expect(writeTemplateProject({ storage, saveFrame, template, projectId: "p1" })).rejects.toThrow(
      /already/i,
    );
    expect((await storage.load("p1")).project.clips.map((c) => c.id)).toEqual(["a"]);
  });
});
