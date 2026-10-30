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
  repeat: false,
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

describe("commandForKey: edit keys", () => {
  it("maps split, delete, ripple delete, duplicate and cancel", () => {
    expect(commandForKey(key({ key: "s" }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "S", shiftKey: true }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "b", ctrlKey: true }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "b", metaKey: true }))).toEqual({ type: "split" });
    expect(commandForKey(key({ key: "Delete" }))).toEqual({ type: "delete" });
    expect(commandForKey(key({ key: "Backspace" }))).toEqual({ type: "delete" });
    expect(commandForKey(key({ key: "Delete", shiftKey: true }))).toEqual({ type: "ripple-delete" });
    expect(commandForKey(key({ key: "Backspace", shiftKey: true }))).toEqual({ type: "ripple-delete" });
    expect(commandForKey(key({ key: "d", ctrlKey: true }))).toEqual({ type: "duplicate" });
    expect(commandForKey(key({ key: "Escape" }))).toEqual({ type: "cancel" });
  });

  it("does not take the browser's save shortcut or other combinations", () => {
    expect(commandForKey(key({ key: "s", ctrlKey: true }))).toBeNull();
    expect(commandForKey(key({ key: "d" }))).toBeNull();
    expect(commandForKey(key({ key: "Delete", ctrlKey: true }))).toBeNull();
  });

  it("ignores edit keys inside fields and widgets", () => {
    expect(commandForKey(key({ key: "s", editable: true }))).toBeNull();
    expect(commandForKey(key({ key: "Delete", handled: true }))).toBeNull();
    expect(commandForKey(key({ key: "Escape", editable: true }))).toBeNull();
  });
});

describe("commandForKey: held keys", () => {
  it("does not repeat one-shot commands", () => {
    for (const k of [
      key({ key: " ", repeat: true }),
      key({ key: "s", repeat: true }),
      key({ key: "Delete", repeat: true }),
      key({ key: "d", ctrlKey: true, repeat: true }),
      key({ key: "z", ctrlKey: true, repeat: true }),
      key({ key: "y", ctrlKey: true, repeat: true }),
      key({ key: "Home", repeat: true }),
    ]) {
      expect(commandForKey(k)).toBeNull();
    }
  });

  it("keeps repeating frame steps and still cancels", () => {
    expect(commandForKey(key({ key: "ArrowRight", repeat: true }))).toEqual({ type: "step", direction: 1 });
    expect(commandForKey(key({ key: "Escape", repeat: true }))).toEqual({ type: "cancel" });
  });
});
