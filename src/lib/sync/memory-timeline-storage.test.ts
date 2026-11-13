import { describe, expect, it } from "vitest";

import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const project = (id: string) => ({
  ...makeProject(makeStandardTracks(), [makeClip({ id: "a", trackId: "t1" })]),
  id,
});

describe("createMemoryTimelineStorage", () => {
  it("loads an empty timeline at revision 0 with the frame", async () => {
    const storage = createMemoryTimelineStorage({ frame: { width: 800, height: 600 } });
    const loaded = await storage.load("p1");
    expect(loaded.project.id).toBe("p1");
    expect(loaded.project.clips).toEqual([]);
    expect(loaded.rev).toBe(0);
    expect(loaded.frame).toEqual({ width: 800, height: 600 });
  });

  it("saves against the current revision and serves it back", async () => {
    const storage = createMemoryTimelineStorage();
    expect(await storage.save("p1", project("p1"), 0)).toEqual({ ok: true, rev: 1 });
    const loaded = await storage.load("p1");
    expect(loaded.rev).toBe(1);
    expect(loaded.project.clips.map((c) => c.id)).toEqual(["a"]);
  });

  it("reports a conflict for a stale revision and keeps the stored copy", async () => {
    const storage = createMemoryTimelineStorage();
    await storage.save("p1", project("p1"), 0);
    expect(await storage.save("p1", { ...project("p1"), clips: [] }, 0)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect((await storage.load("p1")).project.clips).toHaveLength(1);
  });

  it("does not let later edits to a saved object change the stored copy", async () => {
    const storage = createMemoryTimelineStorage();
    const saved = project("p1");
    await storage.save("p1", saved, 0);
    saved.clips.pop();
    expect((await storage.load("p1")).project.clips).toHaveLength(1);
  });

  it("keeps versions, newest first, and can restore and delete them", async () => {
    const storage = createMemoryTimelineStorage();
    const frame = { width: 100, height: 100 };
    await storage.saveVersion("p1", project("p1"), frame, "first");
    await storage.saveVersion("p1", { ...project("p1"), clips: [] }, frame);
    const list = await storage.listVersions("p1");
    expect(list.map((v) => v.label)).toEqual([null, "first"]);
    const restored = await storage.loadVersion("p1", list[1].id);
    expect(restored.project.clips).toHaveLength(1);
    await storage.deleteVersion(list[1].id);
    expect(await storage.listVersions("p1")).toHaveLength(1);
  });
});
