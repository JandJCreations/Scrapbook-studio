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

describe("SelectionToolbar groups", () => {
  it("groups two selected clips, and selecting one afterwards selects both", () => {
    act(() => store().setSelectedClipIds(["a", "o"]));
    render(<SelectionToolbar />);
    expect(screen.queryByRole("button", { name: "Ungroup" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    const [a, o] = [clips().find((c) => c.id === "a"), clips().find((c) => c.id === "o")];
    expect(a?.groupId).not.toBeNull();
    expect(a?.groupId).toBe(o?.groupId);
    act(() => store().setSelectedClipIds(["a"]));
    expect(store().selectedClipIds).toEqual(["a", "o"]);
  });

  it("ungroups them again", () => {
    act(() => store().setSelectedClipIds(["a", "o"]));
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(clips().every((c) => c.groupId === null)).toBe(true);
    expect(screen.queryByRole("button", { name: "Ungroup" })).toBeNull();
  });

  it("offers no Group for a single clip", () => {
    act(() => store().setSelectedClipIds(["a"]));
    render(<SelectionToolbar />);
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
  });
});

describe("SelectionToolbar group buttons in mixed selections", () => {
  const grouped = (id: string, groupId: string | null, locked = false) =>
    makeClip({ id, trackId: "t2", kind: "image", sourceDuration: null, sourceOut: 3, groupId, locked });

  function loadClips(...clipList: ReturnType<typeof grouped>[]) {
    act(() => {
      store().load(makeProject(makeStandardTracks(), clipList));
      store().setSelectedClipIds(clipList.map((c) => c.id));
    });
  }

  it("offers both Group and Ungroup when a group is selected with something outside it", () => {
    loadClips(grouped("a", "g"), grouped("b", "g"), grouped("c", null));
    render(<SelectionToolbar />);
    expect(screen.getByRole("button", { name: "Group" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ungroup" })).toBeTruthy();
  });

  it("merges two groups into one with Group", () => {
    loadClips(grouped("a", "g1"), grouped("b", "g1"), grouped("c", "g2"), grouped("d", "g2"));
    render(<SelectionToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    expect(new Set(clips().map((c) => c.groupId)).size).toBe(1);
  });

  it("does not offer Group for a whole group plus a locked clip outside it", () => {
    loadClips(grouped("a", "g"), grouped("b", "g"), grouped("c", null, true));
    render(<SelectionToolbar />);
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
  });

  it("offers only Ungroup when the whole selection is one group, and no Group when too few can be grouped", () => {
    loadClips(grouped("a", "g"), grouped("b", "g"));
    const view = render(<SelectionToolbar />);
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
    view.unmount();
    loadClips(grouped("x", null), grouped("y", null, true));
    render(<SelectionToolbar />);
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();
  });
});
