// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioView } from "@/components/studio/studio-view";
import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import type { MediaItem } from "@/types/media";

// The painter, audio and Konva stage need a real browser; the view's own
// behaviour is what these tests are about.
vi.mock("@/components/studio/use-studio-playback", () => ({
  useStudioPlayback: () => ({
    containerRef: () => {},
    session: { toggle: vi.fn(), seek: vi.fn(), step: vi.fn() },
    visuals: null,
  }),
}));
vi.mock("@/components/studio/studio-stage", () => ({
  StudioStage: () => <div data-testid="stage" />,
}));
vi.mock("@/lib/playback/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/playback/browser")>()),
  readMediaInfo: async () => ({ duration: 6, width: 1920, height: 1080 }),
}));

const photo: MediaItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Beach",
  type: "image",
  mimeType: "image/jpeg",
  size: 1,
  url: "https://example.com/a.jpg",
  thumbnailUrl: null,
  duration: null,
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "ready",
  progress: 100,
};

function env(overrides: Partial<StudioEnv> = {}): StudioEnv {
  return {
    projectId: "p1",
    projectName: "My trip",
    backHref: "/dashboard",
    storage: createMemoryTimelineStorage(),
    media: {
      urlFor: () => "blob:x",
      posterFor: () => null,
      ensure: async () => {},
      subscribe: () => () => {},
      getVersion: () => 0,
    },
    library: [photo],
    libraryLoading: false,
    saveFrame: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  act(() => useClipProjectStore.getState().load({ id: "", tracks: [], clips: [] }));
});

describe("StudioView", () => {
  it("shows a skeleton, then the editor once the project has loaded", async () => {
    render(<StudioView env={env()} />);
    expect(screen.queryByText("My trip")).toBeNull();
    expect(await screen.findByText("My trip")).toBeTruthy();
    expect(screen.getByTestId("stage")).toBeTruthy();
  });

  it("explains a load failure and retries", async () => {
    let attempts = 0;
    const memory = createMemoryTimelineStorage();
    const storage: TimelineStorage = {
      ...memory,
      load: async (id) => {
        attempts += 1;
        if (attempts <= 4) throw new Error("offline");
        return memory.load(id);
      },
    };
    render(<StudioView env={env({ storage })} />);
    expect(await screen.findByText(/couldn.t load/i, {}, { timeout: 15000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("My trip", {}, { timeout: 15000 })).toBeTruthy();
  }, 40000);

  it("adds a photo to the sequence from the media panel and selects it", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => {
      expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1);
    });
    const project = selectProject(useClipProjectStore.getState());
    expect(project.clips[0]).toMatchObject({ kind: "image", mediaId: photo.id });
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([project.clips[0].id]);
  });

  it("adds a photo as an overlay on its own track", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach as an overlay" }));
    await vi.waitFor(() =>
      expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1),
    );
    const project = selectProject(useClipProjectStore.getState());
    expect(project.tracks.find((t) => t.id === project.clips[0].trackId)?.type).toBe("overlay");
  });

  it("saves a frame size change once and shows it", async () => {
    const saveFrame = vi.fn(async () => {});
    render(<StudioView env={env({ saveFrame })} />);
    await screen.findByText("My trip");
    fireEvent.change(screen.getByLabelText("Frame size"), { target: { value: "square" } });
    expect(saveFrame).toHaveBeenCalledTimes(1);
    expect(saveFrame).toHaveBeenCalledWith({ width: 1080, height: 1080 });
    expect((screen.getByLabelText("Frame size") as HTMLSelectElement).value).toBe("square");
  });

  it("does not touch the project after it unmounts mid-add", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = env({
      media: {
        urlFor: () => "blob:x",
        posterFor: () => null,
        ensure: async () => gate,
        subscribe: () => () => {},
        getVersion: () => 0,
      },
    });
    const view = render(<StudioView env={slow} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    view.unmount();
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(0);
  });

  it("offers Try again when reloading after a conflict fails", async () => {
    const memory = createMemoryTimelineStorage();
    let loads = 0;
    const storage: TimelineStorage = {
      ...memory,
      load: async (id) => {
        loads += 1;
        if (loads >= 2) throw new Error("offline");
        return memory.load(id);
      },
      save: async () => ({ ok: false, reason: "conflict" }),
    };
    render(<StudioView env={env({ storage })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reload" }, { timeout: 10000 }));
    expect(
      await screen.findByRole("button", { name: /try again/i }, { timeout: 15000 }),
    ).toBeTruthy();
  }, 40000);
});

describe("StudioView text", () => {
  async function withText() {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    await screen.findByLabelText("Text content");
    return selectProject(useClipProjectStore.getState());
  }

  it("adds a selected text clip on its own overlay track and shows its panel", async () => {
    const project = await withText();
    expect(project.clips).toHaveLength(1);
    const clip = project.clips[0];
    expect(clip).toMatchObject({ kind: "text", name: "Your text" });
    expect(project.tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([clip.id]);
  });

  it("applies a switch edit as one history entry", async () => {
    await withText();
    const before = useClipProjectStore.getState().history.past.length;
    fireEvent.click(screen.getByRole("switch", { name: "Bold" }));
    const project = selectProject(useClipProjectStore.getState());
    expect(project.clips[0].adjustments.text?.fontWeight).toBe(400);
    expect(useClipProjectStore.getState().history.past.length).toBe(before + 1);
  });

  it("turns several typed changes into one history entry when focus leaves", async () => {
    await withText();
    const before = useClipProjectStore.getState().history.past.length;
    const box = screen.getByLabelText("Text content");
    fireEvent.change(box, { target: { value: "H" } });
    fireEvent.change(box, { target: { value: "Hi" } });
    fireEvent.change(box, { target: { value: "Hi there" } });
    expect(useClipProjectStore.getState().history.past.length).toBe(before);
    fireEvent.blur(box);
    const clip = selectProject(useClipProjectStore.getState()).clips[0];
    expect(clip.adjustments.text?.content).toBe("Hi there");
    expect(clip.name).toBe("Hi there");
    expect(useClipProjectStore.getState().history.past.length).toBe(before + 1);
  });

  it("keeps a typed edit when another gesture starts before the box loses focus", async () => {
    await withText();
    const before = useClipProjectStore.getState().history.past.length;
    fireEvent.change(screen.getByLabelText("Text content"), { target: { value: "Typed" } });
    // A timeline drag or a stage touch begins without blurring the panel.
    fireEvent.pointerDown(document.body);
    expect(useClipProjectStore.getState().history.past.length).toBe(before + 1);
    expect(useClipProjectStore.getState().history.gestureBase).toBeNull();
    expect(selectProject(useClipProjectStore.getState()).clips[0].adjustments.text?.content).toBe("Typed");
  });

  it("opens the Text tab when a text clip is selected", async () => {
    const project = await withText();
    fireEvent.click(screen.getByRole("tab", { name: "media" }));
    expect(screen.queryByLabelText("Text content")).toBeNull();
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([project.clips[0].id]));
    expect(await screen.findByLabelText("Text content")).toBeTruthy();
  });
});

describe("StudioView edit tab", () => {
  async function withPhoto() {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1));
    return selectProject(useClipProjectStore.getState()).clips[0];
  }

  it("stays on the Media tab after adding a file, so several can be added in a row", async () => {
    await withPhoto();
    expect(screen.getByRole("button", { name: "Add Beach to the sequence" })).toBeTruthy();
  });

  it("opens the Edit tab when a picture is selected and edits it as one history entry", async () => {
    const clip = await withPhoto();
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([clip.id]));
    const before = useClipProjectStore.getState().history.past.length;
    fireEvent.keyDown(await screen.findByRole("slider", { name: "Brightness" }), { key: "ArrowRight" });
    const edited = selectProject(useClipProjectStore.getState()).clips[0];
    expect(edited.adjustments.photo?.brightness).toBe(1);
    // The slider ends its change a moment later, inside React's effects.
    await vi.waitFor(() =>
      expect(useClipProjectStore.getState().history.past.length).toBe(before + 1),
    );
    fireEvent.click(screen.getByRole("button", { name: "Flip horizontally" }));
    expect(selectProject(useClipProjectStore.getState()).clips[0].adjustments.photo?.flipHorizontal).toBe(true);
  });

  it("resets the look and opacity", async () => {
    const clip = await withPhoto();
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([clip.id]));
    fireEvent.keyDown(await screen.findByRole("slider", { name: "Opacity" }), { key: "ArrowLeft" });
    expect(selectProject(useClipProjectStore.getState()).clips[0].transform.opacity).toBe(0.99);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const after = selectProject(useClipProjectStore.getState()).clips[0];
    expect(after.transform.opacity).toBe(1);
  });
});
