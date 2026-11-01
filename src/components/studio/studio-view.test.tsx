// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioView } from "@/components/studio/studio-view";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";
import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import type { MediaItem } from "@/types/media";
import { DEFAULT_PHOTO_ADJUSTMENTS } from "@/types/photo-adjustments";

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

  it("keeps the crop when the look is reset", async () => {
    const clip = await withPhoto();
    const crop = { x: 10, y: 20, width: 100, height: 80 };
    act(() => {
      useClipProjectStore.getState().apply((p) => ({
        ...p,
        clips: p.clips.map((c) => ({
          ...c,
          adjustments: { ...c.adjustments, photo: { ...DEFAULT_PHOTO_ADJUSTMENTS, crop, brightness: 30 } },
        })),
      }));
    });
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([clip.id]));
    fireEvent.click(await screen.findByRole("button", { name: "Reset" }));
    const photo = selectProject(useClipProjectStore.getState()).clips[0].adjustments.photo;
    expect(photo?.brightness).toBe(0);
    expect(photo?.crop).toEqual(crop);
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

describe("StudioView keyframes and crop", () => {
  it("adds and removes a keyframe on a text clip", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    await screen.findByLabelText("Text content");
    const before = useClipProjectStore.getState().history.past.length;
    fireEvent.click(screen.getByRole("button", { name: "Add keyframe" }));
    let clip = selectProject(useClipProjectStore.getState()).clips[0];
    expect(clip.keyframes).toHaveLength(1);
    expect(useClipProjectStore.getState().history.past.length).toBe(before + 1);
    fireEvent.click(screen.getByRole("button", { name: /Delete keyframe at/ }));
    clip = selectProject(useClipProjectStore.getState()).clips[0];
    expect(clip.keyframes).toEqual([]);
  });

  async function selectedPhoto() {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1));
    const clip = selectProject(useClipProjectStore.getState()).clips[0];
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([clip.id]));
    return clip;
  }

  it("crops a picture to a square and reshapes its box", async () => {
    const clip = await selectedPhoto();
    const square = await screen.findByRole("button", { name: "1:1" });
    fireEvent.click(square);
    const cropped = selectProject(useClipProjectStore.getState()).clips[0];
    // The mocked file is 1920 x 1080, so the biggest square is 1080 x 1080, centred.
    expect(cropped.adjustments.photo?.crop).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(cropped.transform.height).toBe(cropped.transform.width);
    expect(cropped.transform.width).toBe(clip.transform.width);
  });

  it("clears the crop when going back to the original shape at 1x", async () => {
    await selectedPhoto();
    fireEvent.click(await screen.findByRole("button", { name: "1:1" }));
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    const clip = selectProject(useClipProjectStore.getState()).clips[0];
    expect(clip.adjustments.photo?.crop).toBeNull();
    expect(clip.transform.height).toBeCloseTo((clip.transform.width * 1080) / 1920, 3);
  });

  it("fades an animated clip with a keyframe rather than its static opacity", async () => {
    const clip = await selectedPhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Add keyframe" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Opacity" }), { key: "ArrowLeft" });
    await vi.waitFor(() => {
      const after = selectProject(useClipProjectStore.getState()).clips[0];
      expect(after.keyframes.some((k) => k.opacity === 0.99)).toBe(true);
    });
    expect(selectProject(useClipProjectStore.getState()).clips[0].transform.opacity).toBe(clip.transform.opacity);
    // The slider shows the animated value, so the next step goes on from it.
    await vi.waitFor(() =>
      expect(screen.getByRole("slider", { name: "Opacity" }).getAttribute("aria-valuenow")).toBe("99"),
    );
  });
});

describe("StudioView assets and layers", () => {
  async function openAssets() {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("tab", { name: "assets" }));
  }

  it("adds a sticker from the Assets tab on its own overlay track and stays on that tab", async () => {
    await openAssets();
    fireEvent.click(screen.getByRole("button", { name: "Add Star, Stickers" }));
    const project = selectProject(useClipProjectStore.getState());
    expect(project.clips).toHaveLength(1);
    expect(project.clips[0]).toMatchObject({ kind: "sticker", name: "Star", mediaId: "asset:stickers/Star" });
    expect(project.tracks.find((t) => t.id === project.clips[0].trackId)?.type).toBe("overlay");
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([project.clips[0].id]);
    expect(screen.getByRole("button", { name: "Add Heart, Stickers" })).toBeTruthy();
  });

  it("opens the Edit tab with the sticker panel when a sticker is selected", async () => {
    await openAssets();
    fireEvent.click(screen.getByRole("button", { name: "Add Star, Stickers" }));
    const id = selectProject(useClipProjectStore.getState()).clips[0].id;
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([id]));
    expect(await screen.findByText("Edit sticker")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Opacity" })).toBeTruthy();
  });

  it("shows the stickers in the Layers tab and brings an earlier one to the front", async () => {
    await openAssets();
    fireEvent.click(screen.getByRole("button", { name: "Add Star, Stickers" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Heart, Stickers" }));
    fireEvent.click(screen.getByRole("tab", { name: "layers" }));
    const before = useClipProjectStore.getState().history.past.length;
    fireEvent.click(screen.getByRole("button", { name: "Bring Star forward" }));
    const project = selectProject(useClipProjectStore.getState());
    const order = (name: string) =>
      project.tracks.find((t) => t.id === project.clips.find((c) => c.name === name)!.trackId)!.order;
    expect(order("Star")).toBeLessThan(order("Heart"));
    expect(useClipProjectStore.getState().history.past.length).toBe(before + 1);
  });

  it("stays on the Layers tab when a layer is picked there", async () => {
    await openAssets();
    fireEvent.click(screen.getByRole("button", { name: "Add Star, Stickers" }));
    fireEvent.click(screen.getByRole("tab", { name: "layers" }));
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    fireEvent.click(screen.getByRole("button", { name: "Select Star" }));
    expect(screen.getByRole("button", { name: "Select Star" })).toBeTruthy();
    expect(screen.queryByText("Edit sticker")).toBeNull();
  });
});

describe("StudioView templates and slots", () => {
  const withSlots = TEMPLATE_CATALOG.find((t) => t.objects.some((o) => o.placeholder))!;

  async function openTemplates(overrides: Partial<StudioEnv> = {}) {
    render(<StudioView env={env(overrides)} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("tab", { name: "assets" }));
    // The templates group starts closed; its buttons are in the DOM all the same.
  }

  it("starts an empty project from a template at once, with its frame", async () => {
    const saveFrame = vi.fn(async () => {});
    await openTemplates({ saveFrame });
    fireEvent.click(screen.getByRole("button", { name: "Use the Birthday Bash template" }));
    const project = selectProject(useClipProjectStore.getState());
    const birthday = TEMPLATE_CATALOG.find((t) => t.name === "Birthday Bash")!;
    expect(project.clips).toHaveLength(birthday.objects.length + 1);
    expect(saveFrame).toHaveBeenCalledWith(birthday.frame);
    expect((screen.getByLabelText("Frame size") as HTMLSelectElement).value).toBe("square");
  });

  it("asks before replacing a project that has something in it, and can be undone", async () => {
    await openTemplates();
    fireEvent.click(screen.getByRole("button", { name: "Use the Birthday Bash template" }));
    const first = selectProject(useClipProjectStore.getState()).clips.length;
    fireEvent.click(screen.getByRole("button", { name: `Use the ${withSlots.name} template` }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(first); // nothing yet
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(first);

    fireEvent.click(screen.getByRole("button", { name: `Use the ${withSlots.name} template` }));
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(withSlots.objects.length + 1);
    act(() => useClipProjectStore.getState().undo());
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(first);
  });

  it("fills an empty slot from the library and keeps its place", async () => {
    await openTemplates();
    fireEvent.click(screen.getByRole("button", { name: `Use the ${withSlots.name} template` }));
    const slot = selectProject(useClipProjectStore.getState()).clips.find((c) => c.isPlaceholder)!;
    const place = { x: slot.transform.x, y: slot.transform.y };
    act(() => useClipProjectStore.getState().setSelectedClipIds([slot.id]));
    fireEvent.click(await screen.findByRole("button", { name: "Put Beach in this slot" }));
    await vi.waitFor(() => {
      const filled = selectProject(useClipProjectStore.getState()).clips.find((c) => c.id === slot.id)!;
      expect(filled).toMatchObject({ isPlaceholder: false, mediaId: photo.id, kind: "image" });
    });
    const filled = selectProject(useClipProjectStore.getState()).clips.find((c) => c.id === slot.id)!;
    expect(filled.transform.x).toBeGreaterThanOrEqual(place.x);
    expect(filled.transform.y).toBeGreaterThanOrEqual(place.y - 1e-6);
  });
});

describe("StudioView export and history", () => {
  async function open() {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
  }
  const addPhoto = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips.length).toBeGreaterThan(0));
  };

  it("opens the export dialog from the toolbar", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("radio", { name: "MP4" })).toBeTruthy();
  });

  it("saves a version, then restores it as one undoable step", async () => {
    await open();
    await addPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    fireEvent.change(await screen.findByLabelText("Version name"), { target: { value: "One photo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByText("One photo");
    // Close the dialog and add a second photo.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByLabelText("Version name")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore One photo" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1));
    act(() => useClipProjectStore.getState().undo());
    expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(2);
  });
});

describe("StudioView fades", () => {
  it("fades a picture in and out from the Edit tab, as one undo step per move", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the sequence" }));
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1));
    const id = selectProject(useClipProjectStore.getState()).clips[0].id;
    act(() => useClipProjectStore.getState().setSelectedClipIds([]));
    act(() => useClipProjectStore.getState().setSelectedClipIds([id]));
    fireEvent.keyDown(await screen.findByRole("slider", { name: "Fade in" }), { key: "ArrowRight" });
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips[0].fadeIn).toBe(0.1));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Fade out" }), { key: "ArrowRight" });
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips[0].fadeOut).toBe(0.1));
  });

  it("fades text from the Text tab", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    await screen.findByLabelText("Text content");
    fireEvent.keyDown(screen.getByRole("slider", { name: "Fade in" }), { key: "ArrowRight" });
    await vi.waitFor(() => expect(selectProject(useClipProjectStore.getState()).clips[0].fadeIn).toBe(0.1));
  });
});

function mockPhone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe("StudioView tour and phone layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPhone(false);
  });

  it("opens the welcome tour the first time, and not again once it has been closed", async () => {
    const first = render(<StudioView env={env({ welcomeTour: true })} />);
    await screen.findByText("My trip");
    expect(await screen.findByText("Welcome to Scrapbook Studio")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(window.localStorage.getItem("scrapbook-studio:tour-seen")).toBe("1");
    first.unmount();

    render(<StudioView env={env({ welcomeTour: true })} />);
    await screen.findByText("My trip");
    expect(screen.queryByText("Welcome to Scrapbook Studio")).toBeNull();
  });

  it("does not open the tour on its own where the environment does not ask for it", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.queryByText("Welcome to Scrapbook Studio")).toBeNull();
  });

  it("opens the tour from the help button", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Quick tour" }));
    expect(await screen.findByText("Welcome to Scrapbook Studio")).toBeTruthy();
  });

  it("on a phone, shows the tools in a sheet from a Tools button, once, and closes it after an add", async () => {
    mockPhone(true);
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.queryByRole("button", { name: "Add Beach to the sequence" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    const add = await screen.findByRole("button", { name: "Add Beach to the sequence" });
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    fireEvent.click(add);
    await vi.waitFor(() => {
      expect(selectProject(useClipProjectStore.getState()).clips).toHaveLength(1);
    });
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: "Add Beach to the sequence" })).toBeNull();
    });
  });
});
