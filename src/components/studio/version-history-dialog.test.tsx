// @vitest-environment jsdom
import "@/test/dom-setup";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VersionHistoryDialog } from "@/components/studio/version-history-dialog";
import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const withClips = (ids: string[]) => ({
  ...makeProject(makeStandardTracks(), ids.map((id) => makeClip({ id, trackId: "t1" }))),
  id: "p1",
});

function setup(clipIds = ["a"]) {
  const storage = createMemoryTimelineStorage();
  const onRestore = vi.fn();
  const onOpenChange = vi.fn();
  const snapshot = { project: withClips(clipIds), frame };
  render(
    <VersionHistoryDialog
      open
      onOpenChange={onOpenChange}
      storage={storage}
      projectId="p1"
      getSnapshot={() => snapshot}
      onRestore={onRestore}
    />,
  );
  return { storage, onRestore, onOpenChange };
}

describe("VersionHistoryDialog", () => {
  it("says so when there are no versions yet", async () => {
    setup();
    expect(await screen.findByText(/no saved versions/i)).toBeTruthy();
  });

  it("saves the current project with a label and lists it", async () => {
    const { storage } = setup();
    await screen.findByText(/no saved versions/i);
    fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "Before the cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(await screen.findByText("Before the cut")).toBeTruthy();
    expect((await storage.listVersions("p1")).map((v) => v.label)).toEqual(["Before the cut"]);
    expect((screen.getByLabelText("Version name") as HTMLInputElement).value).toBe("");
  });

  it("lists unnamed versions as Untitled version, newest first", async () => {
    const storage = createMemoryTimelineStorage();
    await storage.saveVersion("p1", withClips(["a"]), frame, "first");
    await storage.saveVersion("p1", withClips(["a"]), frame);
    render(
      <VersionHistoryDialog
        open
        onOpenChange={vi.fn()}
        storage={storage}
        projectId="p1"
        getSnapshot={() => ({ project: withClips(["a"]), frame })}
        onRestore={vi.fn()}
      />,
    );
    const rows = await screen.findAllByRole("listitem");
    expect(rows[0].textContent).toContain("Untitled version");
    expect(rows[1].textContent).toContain("first");
  });

  it("restores a version's project and frame, then closes", async () => {
    const storage = createMemoryTimelineStorage();
    await storage.saveVersion("p1", withClips(["old1", "old2"]), { width: 1080, height: 1080 }, "Old");
    const onRestore = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <VersionHistoryDialog
        open
        onOpenChange={onOpenChange}
        storage={storage}
        projectId="p1"
        getSnapshot={() => ({ project: withClips(["now"]), frame })}
        onRestore={onRestore}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Restore Old" }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    const [project, restoredFrame] = onRestore.mock.calls[0];
    expect(project.clips.map((c: { id: string }) => c.id)).toEqual(["old1", "old2"]);
    expect(project.id).toBe("p1");
    expect(restoredFrame).toEqual({ width: 1080, height: 1080 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("deletes a version", async () => {
    const storage = createMemoryTimelineStorage();
    await storage.saveVersion("p1", withClips(["a"]), frame, "Doomed");
    render(
      <VersionHistoryDialog
        open
        onOpenChange={vi.fn()}
        storage={storage}
        projectId="p1"
        getSnapshot={() => ({ project: withClips(["a"]), frame })}
        onRestore={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete Doomed" }));
    await waitFor(() => expect(screen.queryByText("Doomed")).toBeNull());
    expect(await storage.listVersions("p1")).toEqual([]);
  });

  it("shows a message when the list cannot be loaded", async () => {
    const storage = createMemoryTimelineStorage();
    storage.listVersions = async () => {
      throw new Error("offline");
    };
    render(
      <VersionHistoryDialog
        open
        onOpenChange={vi.fn()}
        storage={storage}
        projectId="p1"
        getSnapshot={() => ({ project: withClips([]), frame })}
        onRestore={vi.fn()}
      />,
    );
    expect(await screen.findByText(/couldn.t load/i)).toBeTruthy();
  });
});
