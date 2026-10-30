export function nextSelection(
  current: string[],
  clipId: string,
  mods: { shift: boolean; ctrl: boolean },
): string[] {
  if (!mods.shift && !mods.ctrl) return [clipId];
  return current.includes(clipId) ? current.filter((id) => id !== clipId) : [...current, clipId];
}

export type TimelineCommand =
  | { type: "toggle-play" }
  | { type: "step"; direction: 1 | -1 }
  | { type: "seek-start" }
  | { type: "seek-end" }
  | { type: "undo" }
  | { type: "redo" };

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True when focus is in an input, select, textarea or contenteditable element. */
  editable: boolean;
}

export function commandForKey(input: KeyInput): TimelineCommand | null {
  if (input.editable || input.altKey) return null;
  const modifier = input.ctrlKey || input.metaKey;

  if (modifier) {
    const k = input.key.toLowerCase();
    if (k === "z") return input.shiftKey ? { type: "redo" } : { type: "undo" };
    if (k === "y") return { type: "redo" };
    return null;
  }

  switch (input.key) {
    case " ":
      return { type: "toggle-play" };
    case "ArrowLeft":
      return { type: "step", direction: -1 };
    case "ArrowRight":
      return { type: "step", direction: 1 };
    case "Home":
      return { type: "seek-start" };
    case "End":
      return { type: "seek-end" };
    default:
      return null;
  }
}
