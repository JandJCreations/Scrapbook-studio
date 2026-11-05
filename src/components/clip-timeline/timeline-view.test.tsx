// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineView } from "@/components/clip-timeline/timeline-view";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { TimelineProject } from "@/types/timeline";

export function mount(project: TimelineProject) {
  act(() => {
    useClipProjectStore.getState().load(project);
    useTransportStore.getState().reset();
  });
  const handlers = { onSeek: vi.fn(), onToggle: vi.fn(), onStep: vi.fn() };
  const view = render(<TimelineView fps={30} {...handlers} />);
  return { ...handlers, unmount: view.unmount };
}

describe("TimelineView (jsdom)", () => {
  it("renders a chip for every clip", () => {
    mount(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", name: "First", sourceOut: 4 }),
        makeClip({ id: "b", name: "Second", start: 4, sourceOut: 4 }),
      ]),
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("passes the media visuals to video chips", () => {
    const asked: number[] = [];
    const visuals = {
      thumbnails: {
        get: (_id: string, time: number) => {
          asked.push(time);
          return null;
        },
        failed: () => false,
        subscribe: () => () => {},
        getVersion: () => 0,
        invalidate: () => {},
        dispose: () => {},
      },
      waveforms: {
        get: () => null,
        failed: () => false,
        subscribe: () => () => {},
        getVersion: () => 0,
        invalidate: () => {},
        dispose: () => {},
      },
      urlFor: () => null,
    };
    act(() => {
      useClipProjectStore
        .getState()
        .load(makeProject(makeStandardTracks(), [makeClip({ id: "a", name: "First", sourceOut: 4 })]));
    });
    render(<TimelineView fps={30} onSeek={vi.fn()} onToggle={vi.fn()} onStep={vi.fn()} visuals={visuals} />);
    expect(asked.length).toBeGreaterThan(0);
  });
});

// jsdom has no layout: place the ruler at x=112 (the header width) and the
// tracks area at y=28 (the ruler height). Default zoom is 60 px per second.
const RULER_LEFT = 112;
const TRACKS_TOP = 28;
const xAt = (time: number) => RULER_LEFT + time * 60;
// Rows: overlay y 0-44, video y 46-110, audio y 112-156 (relative to the tracks area).
const yAt = (rowY: number) => TRACKS_TOP + rowY;

function placeLayout() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const left = this.getAttribute("aria-label") === "Timeline ruler" ? RULER_LEFT : 0;
    const top = this.getAttribute("data-testid") === "timeline-tracks" ? TRACKS_TOP : 0;
    return { x: left, y: top, left, top, right: left, bottom: top, width: 0, height: 0, toJSON() {} };
  });
}

/** Fires a pointer-style event. The primary button counts as held until the pointer is released. */
const pointer = (
  target: Element | Window | Document,
  type: string,
  x: number,
  y: number,
  extra: { pointerId?: number } & MouseEventInit = {},
) => {
  const { pointerId = 1, ...init } = extra;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    ...init,
  });
  // jsdom's MouseEvent has no pointerId; the component reads one from real pointer events.
  Object.assign(event, { pointerId });
  return fireEvent(target, event);
};

const chip = (id: string) => document.querySelector<HTMLElement>(`[data-clip-id="${id}"]`)!;
const present = () => selectProject(useClipProjectStore.getState());
const clipById = (id: string) => present().clips.find((c) => c.id === id)!;
const pastCount = () => useClipProjectStore.getState().history.past.length;

const overlayClip = (id: string, start: number, length: number) =>
  makeClip({
    id,
    trackId: "t2",
    kind: "image",
    name: id,
    sourceDuration: null,
    start,
    sourceIn: 0,
    sourceOut: length,
  });
const videoClip = (id: string, start: number, length: number) =>
  makeClip({ id, trackId: "t1", name: id, start, sourceIn: 0, sourceOut: length, sourceDuration: 100 });

function mountEditable() {
  placeLayout();
  return mount(
    makeProject(makeStandardTracks(), [overlayClip("o", 1, 2), videoClip("a", 0, 4), videoClip("b", 4, 4)]),
  );
}

describe("selection", () => {
  it("selects on click and clears on an empty-lane click", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    expect(chip("o").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(document.querySelector('[data-track-id="t2"]')!);
    expect(chip("o").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("moving", () => {
  it("moves a clip by the pointer and records one undo step", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(1.5) + 2, yAt(10)); // under 4 px: still a click
    expect(clipById("o").start).toBe(1);
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    pointer(window, "pointerup", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    expect(pastCount()).toBe(before + 1);
    act(() => useClipProjectStore.getState().undo());
    expect(clipById("o").start).toBe(1);
  });

  it("does not also select or clear when a drag ends", () => {
    mountEditable();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    pointer(window, "pointerup", xAt(3.5), yAt(10));
    fireEvent.click(chip("o")); // the click the browser sends after the drag
    expect(chip("o").getAttribute("aria-pressed")).toBe("true");
  });

  it("ignores right-click and middle-click", () => {
    mountEditable();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10), { button: 2 });
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(1);
  });

  it("Escape during a drag restores the clip and leaves no history entry", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
    pointer(window, "pointermove", xAt(5), yAt(10)); // listeners are gone
    expect(clipById("o").start).toBe(1);
  });

  it("reorders on the main track and shows an insertion marker", () => {
    mountEditable();
    pointer(chip("b"), "pointerdown", xAt(6), yAt(60));
    pointer(window, "pointermove", xAt(1), yAt(60));
    expect(screen.getByTestId("timeline-guide")).toBeTruthy();
    pointer(window, "pointerup", xAt(1), yAt(60));
    expect(clipById("b").start).toBe(0);
    expect(clipById("a").start).toBe(4);
    expect(screen.queryByTestId("timeline-guide")).toBeNull();
  });

  it("creates exactly one new track however long the drag over empty space lasts", () => {
    mountEditable();
    const tracksBefore = present().tracks.length;
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    for (const x of [2, 2.5, 3, 3.5, 4]) pointer(window, "pointermove", xAt(x), yAt(300));
    pointer(window, "pointerup", xAt(4), yAt(300));
    expect(present().tracks.length).toBe(tracksBefore + 1);
    const clip = clipById("o");
    expect(present().tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
  });

  it("snaps to the playhead and shows a guide while dragging", () => {
    mountEditable();
    act(() => useTransportStore.getState().setFrame(6, false));
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(6.55), yAt(10)); // start 6.05: within 8 px of 6
    expect(clipById("o").start).toBe(6);
    expect(screen.getByTestId("timeline-guide")).toBeTruthy();
    pointer(window, "pointerup", xAt(6.55), yAt(10));
  });

  it("does not move a clip on a locked track", () => {
    placeLayout();
    const tracks = makeStandardTracks().map((t) => (t.id === "t2" ? { ...t, locked: true } : t));
    mount(makeProject(tracks, [overlayClip("o", 1, 2)]));
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    pointer(window, "pointerup", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
  });
});

describe("trimming", () => {
  it("drags the end handle, snapping to a clip edge", () => {
    mountEditable();
    const before = pastCount();
    const handle = chip("o").querySelector('[data-edge="end"]')!;
    pointer(handle, "pointerdown", xAt(3), yAt(10));
    pointer(window, "pointermove", xAt(3.95), yAt(10)); // within 8 px of the video clips' edge at 4
    expect(screen.getByTestId("timeline-guide")).toBeTruthy();
    pointer(window, "pointerup", xAt(3.95), yAt(10));
    expect(clipById("o").sourceOut).toBeCloseTo(3, 9); // start 1, end 4
    expect(pastCount()).toBe(before + 1);
  });

  it("drags the start handle and keeps the end in place", () => {
    mountEditable();
    const handle = chip("o").querySelector('[data-edge="start"]')!;
    pointer(handle, "pointerdown", xAt(1), yAt(10));
    pointer(window, "pointermove", xAt(1.5), yAt(10));
    pointer(window, "pointerup", xAt(1.5), yAt(10));
    const clip = clipById("o");
    expect(clip.start).toBeCloseTo(1.5, 9);
    expect(clip.start + (clip.sourceOut - clip.sourceIn)).toBeCloseTo(3, 9);
  });
});

describe("marquee", () => {
  it("selects the clips inside the dragged box and draws it", () => {
    mountEditable();
    pointer(document.querySelector('[data-track-id="t2"]')!, "pointerdown", xAt(3), yAt(30));
    pointer(window, "pointermove", xAt(0), yAt(80));
    expect(screen.getByTestId("timeline-marquee")).toBeTruthy();
    expect(chip("o").getAttribute("aria-pressed")).toBe("true");
    expect(chip("a").getAttribute("aria-pressed")).toBe("true");
    expect(chip("b").getAttribute("aria-pressed")).toBe("false");
    pointer(window, "pointerup", xAt(0), yAt(80));
    expect(screen.queryByTestId("timeline-marquee")).toBeNull();
  });

  it("adds to the selection with shift and restores it on Escape", () => {
    mountEditable();
    fireEvent.click(chip("b"));
    pointer(document.querySelector('[data-track-id="t2"]')!, "pointerdown", xAt(3), yAt(30), {
      shiftKey: true,
    });
    pointer(window, "pointermove", xAt(0), yAt(80));
    expect(chip("b").getAttribute("aria-pressed")).toBe("true");
    expect(chip("a").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chip("a").getAttribute("aria-pressed")).toBe("false");
    expect(chip("b").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("edit keys", () => {
  it("S splits the selected clip at the playhead", () => {
    mountEditable();
    act(() => useTransportStore.getState().setFrame(2, false));
    fireEvent.click(chip("a"));
    fireEvent.keyDown(window, { key: "s" });
    expect(present().clips.filter((c) => c.trackId === "t1")).toHaveLength(3);
  });

  it("Delete removes the selection", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(present().clips.some((c) => c.id === "o")).toBe(false);
  });

  it("Ctrl+D duplicates the selection", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(present().clips.filter((c) => c.trackId === "t2")).toHaveLength(2);
  });

  it("Escape clears the selection when no drag is active", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chip("o").getAttribute("aria-pressed")).toBe("false");
  });

  it("ignores edit keys typed into a text field and held-down repeats", () => {
    mountEditable();
    fireEvent.click(chip("o"));
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(present().clips.some((c) => c.id === "o")).toBe(true);
    input.remove();
    fireEvent.keyDown(window, { key: "Delete", repeat: true });
    expect(present().clips.some((c) => c.id === "o")).toBe(true);
  });
});

describe("dragging into empty space below the last track", () => {
  it("settles on one new track instead of flickering as the rows shift", () => {
    mountEditable();
    const tracksBefore = present().tracks.length;
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    // Just below the audio row (it ends at y 156): the preview track pushes every row down.
    for (const y of [170, 172, 174, 176]) pointer(window, "pointermove", xAt(3), yAt(y));
    expect(present().tracks.length).toBe(tracksBefore + 1);
    pointer(window, "pointerup", xAt(3), yAt(176));
    expect(present().tracks.length).toBe(tracksBefore + 1);
    const clip = clipById("o");
    expect(present().tracks.find((t) => t.id === clip.trackId)?.type).toBe("overlay");
    expect(clip.start).toBe(2.5);
  });
});

describe("a drag whose end the browser never reports", () => {
  it("ends when the button is no longer held and ignores later moves", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    pointer(window, "pointermove", xAt(4.5), yAt(10), { buttons: 0 }); // released elsewhere
    pointer(window, "pointermove", xAt(7.5), yAt(10));
    expect(clipById("o").start).toBe(3);
    expect(pastCount()).toBe(before + 1);
    expect(useClipProjectStore.getState().history.gestureBase).toBeNull();
  });

  it("is abandoned when the window loses focus", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    fireEvent.blur(window);
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
    pointer(window, "pointermove", xAt(5), yAt(10));
    expect(clipById("o").start).toBe(1);
  });

  it("is abandoned when the browser cancels the pointer", () => {
    mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    pointer(window, "pointercancel", xAt(3.5), yAt(10));
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
  });

  it("is abandoned when the timeline unmounts mid-drag", () => {
    const view = mountEditable();
    const before = pastCount();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10));
    pointer(window, "pointermove", xAt(3.5), yAt(10));
    view.unmount();
    expect(clipById("o").start).toBe(1);
    expect(pastCount()).toBe(before);
    expect(useClipProjectStore.getState().history.gestureBase).toBeNull();
  });

  it("ignores a second pointer while one is dragging", () => {
    mountEditable();
    pointer(chip("o"), "pointerdown", xAt(1.5), yAt(10), { pointerId: 1 });
    pointer(window, "pointermove", xAt(3.5), yAt(10), { pointerId: 2 });
    expect(clipById("o").start).toBe(1);
    pointer(window, "pointerup", xAt(3.5), yAt(10), { pointerId: 2 });
    pointer(window, "pointermove", xAt(3.5), yAt(10), { pointerId: 1 });
    expect(clipById("o").start).toBe(3);
    pointer(window, "pointerup", xAt(3.5), yAt(10), { pointerId: 1 });
  });
});

describe("TimelineView transitions", () => {
  it("marks a clip that has a transition into it, and only that clip", () => {
    mount(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", name: "First", sourceOut: 4 }),
        makeClip({ id: "b", name: "Second", start: 4, sourceOut: 4, transition: { type: "fade", duration: 1 } }),
      ]),
    );
    const markers = screen.getAllByTestId("transition-marker");
    expect(markers).toHaveLength(1);
    expect(markers[0].closest("[data-clip-id]")?.getAttribute("data-clip-id")).toBe("b");
  });

  it("does not mark a transition that does nothing now, because the clip before it is no longer right next to it", () => {
    mount(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", name: "First", sourceOut: 4 }),
        makeClip({ id: "b", name: "Second", start: 6, sourceOut: 4, trackId: "t2", transition: { type: "fade", duration: 1 } }),
      ]),
    );
    expect(screen.queryByTestId("transition-marker")).toBeNull();
  });
});

describe("TimelineView adding and zooming", () => {
  const strip = () =>
    makeProject(makeStandardTracks(), [
      makeClip({ id: "a", name: "First", sourceOut: 4 }),
      makeClip({ id: "b", name: "Second", start: 4, sourceOut: 4 }),
    ]);

  it("has a plus after the last clip of the main strip that asks to add media", () => {
    act(() => {
      useClipProjectStore.getState().load(strip());
      useTransportStore.getState().reset();
    });
    const onAddClip = vi.fn();
    render(<TimelineView fps={30} onSeek={vi.fn()} onToggle={vi.fn()} onStep={vi.fn()} onAddClip={onAddClip} />);
    fireEvent.click(screen.getByRole("button", { name: "Add media to the video" }));
    expect(onAddClip).toHaveBeenCalledTimes(1);
  });

  it("has no plus where adding is not offered", () => {
    mount(strip());
    expect(screen.queryByRole("button", { name: "Add media to the video" })).toBeNull();
  });

  it("zooms the whole timeline with the zoom slider", () => {
    mount(strip());
    const width = () => (document.querySelector("[data-clip-id='a']") as HTMLElement).getBoundingClientRect().width;
    const widthStyle = () => parseFloat((document.querySelector("[data-clip-id='a']") as HTMLElement).style.width);
    const before = widthStyle();
    const slider = screen.getByRole("slider", { name: "Timeline zoom" }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: String(Number(slider.value) + 10) } });
    expect(widthStyle()).toBeGreaterThan(before);
    void width;
  });
});
