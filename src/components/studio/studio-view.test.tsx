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
});
