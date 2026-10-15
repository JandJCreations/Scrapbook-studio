import { describe, expect, it } from "vitest";

import {
  commit,
  createHistory,
  endGesture,
  MAX_HISTORY,
  preview,
  redo,
  undo,
} from "@/lib/timeline/history";

describe("commit / undo / redo", () => {
  it("records each commit as an undo step", () => {
    let h = createHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(undo(h)).toBe(h);
  });

  it("redoes undone steps", () => {
    let h = commit(commit(createHistory(0), 1), 2);
    h = undo(undo(h));
    h = redo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(redo(h)).toBe(h);
  });

  it("clears the redo stack on a new commit", () => {
    let h = commit(commit(createHistory(0), 1), 2);
    h = commit(undo(h), 9);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it("ignores a commit that does not change the state", () => {
    const h = createHistory({ a: 1 });
    expect(commit(h, h.present)).toBe(h);
  });

  it("caps the history at MAX_HISTORY entries, dropping the oldest", () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 50; i++) h = commit(h, i);
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]).toBe(50);
  });
});

describe("gestures", () => {
  it("collapses many previews into one undo step", () => {
    let h = createHistory(0);
    h = preview(h, 1);
    h = preview(h, 2);
    h = preview(h, 3);
    expect(h.present).toBe(3);
    expect(h.past).toEqual([]);
    h = endGesture(h);
    expect(h.past).toEqual([0]);
    expect(h.gestureBase).toBeNull();
    expect(undo(h).present).toBe(0);
  });

  it("adds no history entry when the gesture ends where it began", () => {
    let h = createHistory(0);
    h = preview(h, 5);
    h = preview(h, 0);
    h = endGesture(h);
    expect(h.past).toEqual([]);
    expect(h.gestureBase).toBeNull();
  });

  it("ignores a preview that does not change the state", () => {
    const h = createHistory(0);
    expect(preview(h, 0)).toBe(h);
  });

  it("returns the same history when ending a gesture that is not open", () => {
    const h = createHistory(0);
    expect(endGesture(h)).toBe(h);
  });

  it("cancels the drag when undo is pressed mid-gesture", () => {
    let h = createHistory(0);
    h = preview(h, 1);
    h = preview(h, 2);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(h.gestureBase).toBeNull();
    expect(h.past).toEqual([]);
    expect(redo(h).present).toBe(2);
  });

  it("closes an open gesture before committing", () => {
    let h = createHistory(0);
    h = preview(h, 1);
    h = commit(h, 2);
    expect(h.past).toEqual([0, 1]);
    expect(h.gestureBase).toBeNull();
  });
});
