// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SelectionToolbar } from "@/components/studio/selection-toolbar";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";

const store = () => useClipProjectStore.getState();
const clips = () => selectProject(store()).clips;

beforeEach(() => {
  act(() => {
    store().load(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", trackId: "t1", start: 0, sourceOut: 4 }),
        makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null, sourceOut: 3 }),
      ]),
    );
    store().setSelectedClipIds([]);
  });
});

describe("SelectionToolbar", () => {
  it("shows nothing without a selection", () => {
    const { container } = render(<SelectionToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it("duplicates the selection and selects the copies", () => {
    act(() => store().setSelectedClipIds(["o"]));
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(clips()).toHaveLength(3);
    const copy = clips().find((c) => c.id !== "a" && c.id !== "o");
    expect(copy?.kind).toBe("image");
    expect(store().selectedClipIds).toEqual([copy?.id]);
  });

  it("locks, then unlocks, the selected clips, and the label follows", () => {
    act(() => store().setSelectedClipIds(["a", "o"]));
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(clips().every((c) => c.locked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(clips().every((c) => !c.locked)).toBe(true);
  });

  it("deletes the selection, clears it and tidies the emptied track, as one history entry", () => {
    act(() => store().setSelectedClipIds(["o"]));
    render(<SelectionToolbar />);
    const before = store().history.past.length;
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(clips().map((c) => c.id)).toEqual(["a"]);
    expect(selectProject(store()).tracks.some((t) => t.id === "t2")).toBe(false);
    expect(store().selectedClipIds).toEqual([]);
    expect(store().history.past.length).toBe(before + 1);
  });

  it("does not duplicate or delete locked clips", () => {
    act(() => {
      store().apply((p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, locked: true })) }));
      store().setSelectedClipIds(["a"]);
    });
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(clips()).toHaveLength(2);
  });
});
