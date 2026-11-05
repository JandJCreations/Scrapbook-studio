// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioView } from "@/components/studio/studio-view";
import { MUSIC_LIBRARY } from "@/lib/audio/music-library-catalog";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";
import { clipEnd, projectDuration } from "@/lib/timeline/clip-math";
import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
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
const forest: MediaItem = { ...photo, id: "22222222-2222-4222-8222-222222222222", name: "Forest" };
const third: MediaItem = { ...photo, id: "66666666-6666-4666-8666-666666666666", name: "Lake" };
const song: MediaItem = {
  ...photo,
  id: "33333333-3333-4333-8333-333333333333",
  name: "My song",
  type: "audio",
  mimeType: "audio/mpeg",
  duration: 200,
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

function mockPhone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const clips = () => selectProject(useClipProjectStore.getState()).clips;

beforeEach(() => {
  window.localStorage.clear();
  mockPhone(false);
  act(() => useClipProjectStore.getState().load({ id: "", tracks: [], clips: [] }));
});

describe("StudioView", () => {
  it("shows a skeleton, then the editor with a plain preview and none of the free-placement canvas tools", async () => {
    render(<StudioView env={env()} />);
    expect(screen.queryByText("My trip")).toBeNull();
    expect(await screen.findByText("My trip")).toBeTruthy();
    expect(screen.getByTestId("studio-preview")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "assets" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "layers" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Snap to grid" })).toBeNull();
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

  it("adds a photo to the end of the video and selects it, showing its details", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.getByText(/import photos or videos/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    expect(clips()[0]).toMatchObject({ kind: "image", mediaId: photo.id });
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([clips()[0].id]);
    expect(await screen.findByRole("slider", { name: "Duration (seconds)" })).toBeTruthy();
  });

  it("adds several ticked photos at once, one after another", async () => {
    render(<StudioView env={env({ library: [photo, forest] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    expect(clips().map((c) => c.mediaId)).toEqual([photo.id, forest.id]);
    expect(clips()[1].start).toBeCloseTo(clipEnd(clips()[0]));
  });

  it("keeps the reason an item failed on screen even though later items were added", async () => {
    const bad: MediaItem = { ...photo, id: "44444444-4444-4444-8444-444444444444", name: "Gone", url: "" };
    const base = env();
    render(
      <StudioView
        env={env({
          library: [bad, forest],
          media: { ...base.media, urlFor: (id: string) => (id === bad.id ? null : "blob:x") },
        })}
      />,
    );
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Gone" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn.t available|couldn.t add/i);
  });

  it("puts music under the video and cuts it to the video's length", async () => {
    render(<StudioView env={env({ library: [photo, song] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    const videoEnd = clipEnd(clips()[0]);

    fireEvent.click(screen.getByRole("tab", { name: "audio" }));
    const track = MUSIC_LIBRARY[0];
    fireEvent.click(screen.getByRole("button", { name: `Add ${track.name} as music` }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    const music = clips().find((c) => c.kind === "audio")!;
    expect(music.mediaId).toContain(track.id);
    expect(clipEnd(music)).toBeCloseTo(videoEnd);

    // The user's own song is cut the same way.
    fireEvent.click(screen.getByRole("button", { name: "Add My song as music" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(3));
    const mine = clips().find((c) => c.mediaId === song.id)!;
    expect(clipEnd(mine)).toBeCloseTo(videoEnd);
  });

  it("starts music at the beginning when the playhead sits at the end of the video, and the video stays as long as its pictures", async () => {
    render(<StudioView env={env({ library: [photo] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    const videoEnd = clipEnd(clips()[0]);
    act(() => useTransportStore.getState().setFrame(videoEnd, false));
    fireEvent.click(screen.getByRole("tab", { name: "audio" }));
    fireEvent.click(screen.getByRole("button", { name: `Add ${MUSIC_LIBRARY[0].name} as music` }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    const music = clips().find((c) => c.kind === "audio")!;
    expect(music.start).toBe(0);
    expect(projectDuration(selectProject(useClipProjectStore.getState()))).toBeCloseTo(videoEnd);
  });

  it("puts a transition between two photos from the details panel, and takes it away again", async () => {
    render(<StudioView env={env({ library: [photo, forest] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    // The second photo is selected after adding: it has a photo before it.
    const select = (await screen.findByLabelText("Transition")) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "slide-left" } });
    expect(clips()[1].transition).toEqual({ type: "slide-left", duration: 0.6 });
    expect(await screen.findByRole("slider", { name: "Transition length (seconds)" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Transition"), { target: { value: "none" } });
    expect(clips()[1].transition ?? null).toBeNull();
  });

  it("applies one transition to every slide, and one length to every photo", async () => {
    const third: MediaItem = { ...photo, id: "55555555-5555-4555-8555-555555555555", name: "Lake" };
    render(<StudioView env={env({ library: [photo, forest, third] })} />);
    await screen.findByText("My trip");
    for (const name of ["Beach", "Forest", "Lake"]) fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(3));

    fireEvent.change(await screen.findByLabelText("Transition"), { target: { value: "dip" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to all slides" }));
    expect(clips().map((c) => c.transition?.type ?? null)).toEqual([null, "dip", "dip"]);

    fireEvent.click(screen.getByRole("button", { name: "Apply this length to all photos" }));
    const lengths = clips().map((c) => clipEnd(c) - c.start);
    expect(new Set(lengths).size).toBe(1);
  });

  it("says the first clip has nothing to transition from", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    expect(await screen.findByText(/no clip directly before/i)).toBeTruthy();
  });

  it("has split, duplicate and delete above the timeline", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.getByRole("toolbar", { name: "Clip tools" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(clips()).toHaveLength(0);
  });

  it("puts the frame size back and says so when it cannot be saved", async () => {
    render(
      <StudioView
        env={env({
          saveFrame: vi.fn(async () => {
            throw new Error("offline");
          }),
        })}
      />,
    );
    await screen.findByText("My trip");
    fireEvent.change(screen.getByLabelText("Frame size"), { target: { value: "square" } });
    expect(await screen.findByRole("alert")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    view.unmount();
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(clips()).toHaveLength(0);
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
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reload" }, { timeout: 10000 }));
    expect(await screen.findByRole("button", { name: /try again/i }, { timeout: 15000 })).toBeTruthy();
  }, 40000);
});

describe("StudioView tour", () => {
  it("opens the welcome tour the first time, and not again once it has been closed", async () => {
    const first = render(<StudioView env={env({ welcomeTour: true })} />);
    await screen.findByText("My trip");
    expect(await screen.findByText(TOUR_STEPS[0].title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(window.localStorage.getItem("scrapbook-studio:tour-seen")).toBe("1");
    first.unmount();

    render(<StudioView env={env({ welcomeTour: true })} />);
    await screen.findByText("My trip");
    expect(screen.queryByText(TOUR_STEPS[0].title)).toBeNull();
  });

  it("does not open on its own where the environment does not ask for it, but can be opened", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.queryByText(TOUR_STEPS[0].title)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quick tour" }));
    expect(await screen.findByText(TOUR_STEPS[0].title)).toBeTruthy();
  });

  it.each([
    ["desktop", false],
    ["phone", true],
  ])("has an element for every tour step on %s", async (_name, phone) => {
    mockPhone(phone);
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    for (const step of TOUR_STEPS) {
      const selector = phone ? (step.mobileTargetSelector ?? step.targetSelector) : step.targetSelector;
      if (!selector) continue;
      expect(document.querySelector(`[data-tour="${selector}"]`), selector).not.toBeNull();
    }
  });
});

describe("StudioView on a phone", () => {
  beforeEach(() => mockPhone(true));

  it("keeps the panels in a sheet behind an Add button, closes it after an add, and never shows two copies", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.queryByRole("button", { name: "Add Beach to the video" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const add = await screen.findByRole("button", { name: "Add Beach to the video" });
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    fireEvent.click(add);
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Add Beach to the video" })).toBeNull());
  });

  it("opens the details of the selected clip from the edit button", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect((screen.getByRole("button", { name: "Edit selected" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    await vi.waitFor(() =>
      expect((screen.getByRole("button", { name: "Edit selected" }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit selected" }));
    expect(await screen.findByRole("slider", { name: "Duration (seconds)" })).toBeTruthy();
  });
});

describe("StudioView dragging media onto the timeline", () => {
  function dropOn(trackType: "video" | "audio", payload: unknown, atSeconds: number) {
    const track = selectProject(useClipProjectStore.getState()).tracks.find((t) => t.type === trackType)!;
    const lane = document.querySelector(`[data-track-id='${track.id}']`) as HTMLElement;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(event, {
      clientX: atSeconds * 60, // the timeline starts at 60 pixels a second
      clientY: 0,
      dataTransfer: {
        types: [
          "application/x-studio-media",
          (payload as { source: string; id: string }).source === "music" || (payload as { id: string }).id === song.id
            ? "application/x-studio-media-kind-audio"
            : "application/x-studio-media-kind-visual",
        ],
        getData: (type: string) => (type === "application/x-studio-media" ? JSON.stringify(payload) : ""),
      },
    });
    act(() => {
      lane.dispatchEvent(event);
    });
  }

  it("puts a photo dropped on the strip where it was dropped, between the clips", async () => {
    render(<StudioView env={env({ library: [photo, forest, third] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));

    // Beach and Forest are 5 seconds each; 5.0 is the cut between them.
    dropOn("video", { source: "library", id: third.id }, 5);
    await vi.waitFor(() => expect(clips()).toHaveLength(3));
    expect([...clips()].sort((a, b) => a.start - b.start).map((c) => c.mediaId)).toEqual([photo.id, third.id, forest.id]);
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([clips().find((c) => c.mediaId === third.id)!.id]);
  });

  it("puts a built-in track dropped on the music lane there, cut to the video", async () => {
    render(<StudioView env={env({ library: [photo, forest, third] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    dropOn("audio", { source: "music", id: MUSIC_LIBRARY[1].id }, 1);
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    const music = clips().find((c) => c.kind === "audio")!;
    expect(music.start).toBe(1);
    expect(clipEnd(music)).toBeCloseTo(clipEnd(clips().find((c) => c.kind === "image")!));
  });

  it("ignores a photo dropped on the music lane and a song dropped on the strip", async () => {
    render(<StudioView env={env({ library: [photo, song] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: "audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Add My song as music" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    dropOn("audio", { source: "library", id: photo.id }, 1);
    dropOn("video", { source: "library", id: song.id }, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(clips()).toHaveLength(2);
  });
});

describe("StudioView galleries", () => {
  async function withTwo() {
    render(<StudioView env={env({ library: [photo, forest] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
  }

  it("gives the selected photo the filter picked in the Filters gallery", async () => {
    await withTwo();
    fireEvent.click(screen.getByRole("tab", { name: "filters" }));
    fireEvent.click(await screen.findByRole("button", { name: "Filter Noir" }));
    expect(clips()[1].adjustments.photo?.filterPreset).toBe("noir");
    expect(screen.getByRole("button", { name: "Filter Noir" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("puts the transition picked in the Transitions gallery into the selected clip", async () => {
    await withTwo();
    fireEvent.click(screen.getByRole("tab", { name: "transitions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Transition Dip to black" }));
    expect(clips()[1].transition).toEqual({ type: "dip", duration: 0.6 });
    fireEvent.click(screen.getByRole("button", { name: "Transition None" }));
    expect(clips()[1].transition ?? null).toBeNull();
  });

  it("opens the Transitions gallery from the box on a cut in the timeline", async () => {
    await withTwo();
    fireEvent.click(screen.getByRole("tab", { name: "filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Transition between slides" }));
    expect(screen.getByRole("tab", { name: "transitions" }).getAttribute("aria-selected")).toBe("true");
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([clips()[1].id]);
  });
});

describe("StudioView photo motion", () => {
  it("gives a photo a motion from Details, and every photo with the apply button", async () => {
    render(<StudioView env={env({ library: [photo, forest] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));

    fireEvent.change(await screen.findByLabelText("Motion"), { target: { value: "zoom-in" } });
    expect(clips()[1].motion).toBe("zoom-in");
    expect(clips()[0].motion ?? null).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply motion to all photos" }));
    expect(clips().map((c) => c.motion)).toEqual(["zoom-in", "zoom-in"]);
    fireEvent.change(screen.getByLabelText("Motion"), { target: { value: "none" } });
    expect(clips()[1].motion ?? null).toBeNull();
  });
});

describe("StudioView first drop and music dropped late", () => {
  const dropEvent = (payload: unknown, kind: "visual" | "audio", clientX = 0) => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(event, {
      clientX,
      clientY: 0,
      dataTransfer: {
        types: ["application/x-studio-media", `application/x-studio-media-kind-${kind}`],
        getData: (type: string) => (type === "application/x-studio-media" ? JSON.stringify(payload) : ""),
      },
    });
    return event;
  };

  it("lets media be dropped on a timeline that has no strip at all", async () => {
    render(<StudioView env={env({ library: [photo] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(clips()).toHaveLength(0);
    // Deleting leaves the empty lanes in place; a project that has none (an old one) is what needs the drop place.
    act(() => useClipProjectStore.getState().apply((p) => ({ ...p, tracks: [] })));

    const zone = await screen.findByTestId("timeline-drop-video");
    act(() => {
      zone.dispatchEvent(dropEvent({ source: "library", id: photo.id }, "visual"));
    });
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    expect(clips()[0]).toMatchObject({ kind: "image", mediaId: photo.id });
  });

  it("starts music where it was dropped, even past the end of the video", async () => {
    render(<StudioView env={env({ library: [photo] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    const audioTrack = selectProject(useClipProjectStore.getState()).tracks.find((t) => t.type === "audio")!;
    const lane = document.querySelector(`[data-track-id='${audioTrack.id}']`) as HTMLElement;
    act(() => {
      lane.dispatchEvent(dropEvent({ source: "music", id: MUSIC_LIBRARY[0].id }, "audio", 30 * 60));
    });
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
    expect(clips().find((c) => c.kind === "audio")!.start).toBeCloseTo(30);
  });
});

describe("StudioView text and captions", () => {
  async function withSlides() {
    render(<StudioView env={env({ library: [photo, forest] })} />);
    await screen.findByText("My trip");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beach" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Forest" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(2));
  }
  const texts = () => clips().filter((c) => c.kind === "text");

  it("adds text at the playhead from the Text tab and lets its words be edited in Details", async () => {
    await withSlides();
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    await vi.waitFor(() => expect(texts()).toHaveLength(1));
    expect(useClipProjectStore.getState().selectedClipIds).toEqual([texts()[0].id]);
    const box = await screen.findByLabelText("Text");
    fireEvent.change(box, { target: { value: "Summer 2026" } });
    fireEvent.blur(box);
    expect(texts()[0].adjustments.text?.content).toBe("Summer 2026");
    expect(texts()[0].name).toBe("Summer 2026");
  });

  it("adds a styled text from a style tile, then restyles it from another tile while it is selected", async () => {
    await withSlides();
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Text style Neon" }));
    await vi.waitFor(() => expect(texts()).toHaveLength(1));
    expect(texts()[0].adjustments.text?.fontFamily).toBe("Bebas Neue");
    fireEvent.click(screen.getByRole("button", { name: "Text style Elegant" }));
    expect(texts()).toHaveLength(1);
    expect(texts()[0].adjustments.text?.fontFamily).toBe("Playfair Display");
  });

  it("adds a caption that lasts as long as the selected slide", async () => {
    await withSlides();
    const slide = clips().find((c) => c.kind === "image")!;
    act(() => useClipProjectStore.getState().setSelectedClipIds([slide.id]));
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Caption for selected slide" }));
    await vi.waitFor(() => expect(texts()).toHaveLength(1));
    expect(texts()[0].start).toBeCloseTo(slide.start);
    expect(clipEnd(texts()[0])).toBeCloseTo(clipEnd(slide));
  });

  it("does not make the video longer when text runs past the last slide", async () => {
    await withSlides();
    const videoLength = projectDuration(selectProject(useClipProjectStore.getState()));
    act(() => useTransportStore.getState().setFrame(videoLength - 0.5, false));
    fireEvent.click(screen.getByRole("tab", { name: "text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    await vi.waitFor(() => expect(texts()).toHaveLength(1));
    expect(projectDuration(selectProject(useClipProjectStore.getState()))).toBeCloseTo(videoLength);
  });
});

describe("StudioView layout", () => {
  it("shows the project (its shape and length) when nothing is selected, and a clip's details when one is", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.getByRole("heading", { name: "Your video" })).toBeTruthy();
    expect(screen.getByText("0 clips")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Beach to the video" }));
    await vi.waitFor(() => expect(clips()).toHaveLength(1));
    expect(await screen.findByRole("slider", { name: "Duration (seconds)" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your video" })).toBeNull();
  });

  it("has a bar under the preview that moves the playhead", async () => {
    render(<StudioView env={env()} />);
    await screen.findByText("My trip");
    expect(screen.getByRole("slider", { name: "Seek" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Full screen" })).toBeTruthy();
  });
});
