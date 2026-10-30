import { describe, expect, it } from "vitest";

import { commandForKey, nextSelection, type KeyInput } from "@/lib/timeline-ui/interactions";

const key = (overrides: Partial<KeyInput>): KeyInput => ({
  key: "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  editable: false,
  handled: false,
  ...overrides,
});

describe("nextSelection", () => {
  const none = { shift: false, ctrl: false };

  it("replaces the selection with a plain click", () => {
    expect(nextSelection(["a", "b"], "c", none)).toEqual(["c"]);
    expect(nextSelection(["a", "b"], "a", none)).toEqual(["a"]);
  });

  it("adds with shift or ctrl and removes when already selected", () => {
    expect(nextSelection(["a"], "b", { shift: true, ctrl: false })).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "a", { shift: false, ctrl: true })).toEqual(["b"]);
  });
});

describe("commandForKey", () => {
  it("maps transport keys", () => {
    expect(commandForKey(key({ key: " " }))).toEqual({ type: "toggle-play" });
    expect(commandForKey(key({ key: "ArrowRight" }))).toEqual({ type: "step", direction: 1 });
    expect(commandForKey(key({ key: "ArrowLeft" }))).toEqual({ type: "step", direction: -1 });
    expect(commandForKey(key({ key: "Home" }))).toEqual({ type: "seek-start" });
    expect(commandForKey(key({ key: "End" }))).toEqual({ type: "seek-end" });
  });

  it("maps undo and redo for ctrl and cmd", () => {
    expect(commandForKey(key({ key: "z", ctrlKey: true }))).toEqual({ type: "undo" });
    expect(commandForKey(key({ key: "z", metaKey: true }))).toEqual({ type: "undo" });
    expect(commandForKey(key({ key: "Z", ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(commandForKey(key({ key: "z", ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(commandForKey(key({ key: "y", ctrlKey: true }))).toEqual({ type: "redo" });
  });

  it("ignores everything while typing in a field", () => {
    expect(commandForKey(key({ key: " ", editable: true }))).toBeNull();
    expect(commandForKey(key({ key: "z", ctrlKey: true, editable: true }))).toBeNull();
    expect(commandForKey(key({ key: "ArrowLeft", editable: true }))).toBeNull();
  });

  it("ignores alt combinations and unrelated keys", () => {
    expect(commandForKey(key({ key: " ", altKey: true }))).toBeNull();
    expect(commandForKey(key({ key: "a" }))).toBeNull();
    expect(commandForKey(key({ key: "ArrowLeft", ctrlKey: true }))).toBeNull();
    expect(commandForKey(key({ key: " ", metaKey: true }))).toBeNull();
  });
});

describe("commandForKey: keys another widget already handled", () => {
  it("ignores a key that a menu, dialog or other widget has handled", () => {
    expect(commandForKey(key({ key: "ArrowLeft", handled: true }))).toBeNull();
    expect(commandForKey(key({ key: " ", handled: true }))).toBeNull();
    expect(commandForKey(key({ key: "z", ctrlKey: true, handled: true }))).toBeNull();
  });
});
