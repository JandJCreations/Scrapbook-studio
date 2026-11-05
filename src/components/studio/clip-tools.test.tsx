// @vitest-environment jsdom
import "@/test/dom-setup";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ClipTools } from "@/components/studio/clip-tools";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

const store = () => useClipProjectStore.getState();
const clips = () => selectProject(store()).clips;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  act(() => {
    store().load(
      makeProject(makeStandardTracks(), [
        makeClip({ id: "a", trackId: "t1", start: 0, sourceOut: 4 }),
        makeClip({ id: "b", trackId: "t1", start: 4, sourceOut: 4 }),
      ]),
    );
    store().setSelectedClipIds([]);
    useTransportStore.getState().reset();
  });
});

describe("ClipTools", () => {
  it("has nothing to duplicate or delete without a selection, and nothing to split off a clip", () => {
    render(<ClipTools />);
    expect(button("Duplicate").disabled).toBe(true);
    expect(button("Delete").disabled).toBe(true);
    expect(button("Split").disabled).toBe(true);
  });

  it("splits the selected clip at the playhead", () => {
    act(() => {
      store().setSelectedClipIds(["a"]);
      useTransportStore.getState().setFrame(1.5, false);
    });
    render(<ClipTools />);
    expect(button("Split").disabled).toBe(false);
    fireEvent.click(button("Split"));
    expect(clips()).toHaveLength(3);
  });

  it("duplicates the selection and selects the copy", () => {
    act(() => store().setSelectedClipIds(["a"]));
    render(<ClipTools />);
    fireEvent.click(button("Duplicate"));
    expect(clips()).toHaveLength(3);
    const copy = clips().find((c) => c.id !== "a" && c.id !== "b");
    expect(store().selectedClipIds).toEqual([copy?.id]);
  });

  it("deletes the selection, closing the gap it leaves on the main strip", () => {
    act(() => store().setSelectedClipIds(["a"]));
    render(<ClipTools />);
    fireEvent.click(button("Delete"));
    expect(clips().map((c) => c.id)).toEqual(["b"]);
    expect(clips()[0].start).toBe(0);
    expect(store().selectedClipIds).toEqual([]);
  });

  it("deleting a song does not move the songs after it", () => {
    act(() => {
      store().load(
        makeProject(makeStandardTracks(), [
          makeClip({ id: "s1", trackId: "t3", kind: "audio", start: 0, sourceOut: 2, sourceDuration: 50 }),
          makeClip({ id: "s2", trackId: "t3", kind: "audio", start: 3, sourceOut: 2, sourceDuration: 50 }),
        ]),
      );
      store().setSelectedClipIds(["s1"]);
    });
    render(<ClipTools />);
    fireEvent.click(button("Delete"));
    expect(clips().map((c) => [c.id, c.start])).toEqual([["s2", 3]]);
  });

  it("offers no split where it would leave a sliver (too close to a clip's edge)", () => {
    act(() => {
      store().setSelectedClipIds(["a"]);
      useTransportStore.getState().setFrame(0.05, false);
    });
    render(<ClipTools />);
    expect(button("Split").disabled).toBe(true);
  });

  it("lets go of the button after a mouse click, so Space plays instead of repeating it", () => {
    act(() => store().setSelectedClipIds(["a"]));
    render(<ClipTools />);
    const duplicate = button("Duplicate");
    duplicate.focus();
    expect(document.activeElement).toBe(duplicate);
    fireEvent.click(duplicate, { detail: 1 });
    expect(document.activeElement).not.toBe(duplicate);
  });

  it("keeps keyboard focus on the button after a keyboard activation", () => {
    act(() => store().setSelectedClipIds(["a"]));
    render(<ClipTools />);
    const duplicate = button("Duplicate");
    duplicate.focus();
    fireEvent.click(duplicate, { detail: 0 });
    expect(document.activeElement).toBe(duplicate);
  });
});
