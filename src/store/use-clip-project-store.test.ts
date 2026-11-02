import { beforeEach, describe, expect, it } from "vitest";

import { deleteClips } from "@/lib/timeline/delete";
import { moveClip } from "@/lib/timeline/place";
import { splitClip } from "@/lib/timeline/split";
import {
  getClip,
  makeClip,
  makeProject,
  makeStandardTracks,
  seqIds,
} from "@/lib/timeline/test-utils";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";

const initial = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "main", start: 0, sourceOut: 10 }),
    makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 3 }),
  ]);

const state = () => useClipProjectStore.getState();

beforeEach(() => {
  state().load(initial());
});

describe("apply / undo / redo", () => {
  it("applies an operation as one undoable step", () => {
    const before = selectProject(state());
    state().apply((p) => splitClip(p, "main", 4, seqIds()));
    expect(selectProject(state()).clips).toHaveLength(3);

    state().undo();
    expect(selectProject(state())).toBe(before);

    state().redo();
    expect(selectProject(state()).clips).toHaveLength(3);
  });

  it("records no history entry for a no-op operation", () => {
    state().apply((p) => splitClip(p, "main", 0, seqIds()));
    expect(selectCanUndo(state())).toBe(false);
  });

  it("reports canUndo and canRedo", () => {
    expect(selectCanUndo(state())).toBe(false);
    expect(selectCanRedo(state())).toBe(false);
    state().apply((p) => moveClip(p, "o", { start: 8 }));
    expect(selectCanUndo(state())).toBe(true);
    state().undo();
    expect(selectCanRedo(state())).toBe(true);
  });

  it("load resets history and selection", () => {
    state().setSelectedClipIds(["o"]);
    state().apply((p) => moveClip(p, "o", { start: 8 }));
    state().load(initial());
    expect(selectCanUndo(state())).toBe(false);
    expect(state().selectedClipIds).toEqual([]);
  });
});

describe("gestures", () => {
  it("collapses a whole drag into one undo step", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().previewApply((p) => moveClip(p, "o", { start: 9 }));
    state().endGesture();

    expect(getClip(selectProject(state()), "o").start).toBe(9);
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
    expect(selectCanUndo(state())).toBe(false);
  });

  it("computes each preview from where the drag began, not cumulatively", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    expect(getClip(selectProject(state()), "o").start).toBe(5);
    state().endGesture();
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
  });

  it("cancels the drag cleanly when undo is pressed mid-drag", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
    expect(state().history.gestureBase).toBeNull();
    expect(selectCanUndo(state())).toBe(false);
    expect(selectCanRedo(state())).toBe(false);

    state().redo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
  });

  it("keeps the existing redo stack when a drag is cancelled", () => {
    state().apply((p) => moveClip(p, "o", { start: 8 }));
    state().undo();
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().undo();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
    state().redo();
    expect(getClip(selectProject(state()), "o").start).toBe(8);
  });

  it("cancelGesture drops the drag without adding history", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    state().cancelGesture();
    expect(getClip(selectProject(state()), "o").start).toBe(2);
    expect(selectCanUndo(state())).toBe(false);
    expect(selectCanRedo(state())).toBe(false);
  });

  it("saves only committed state: mid-drag the savable project is the pre-drag one", () => {
    const before = selectProject(state());
    state().previewApply((p) => moveClip(p, "o", { start: 5 }));
    expect(selectSavableProject(state())).toBe(before);

    state().endGesture();
    expect(selectSavableProject(state())).toBe(selectProject(state()));
    expect(getClip(selectSavableProject(state()), "o").start).toBe(5);
  });

  it("adds no undo step when a drag ends where it began", () => {
    state().previewApply((p) => moveClip(p, "o", { start: 2 }));
    state().endGesture();
    expect(selectCanUndo(state())).toBe(false);
  });
});

describe("selection", () => {
  it("drops selected ids that no longer exist after an edit", () => {
    state().setSelectedClipIds(["main", "o"]);
    state().apply((p) => deleteClips(p, ["o"]));
    expect(state().selectedClipIds).toEqual(["main"]);
  });

  it("drops selected ids that disappear on undo", () => {
    state().apply((p) => splitClip(p, "main", 4, seqIds()));
    state().setSelectedClipIds(["id-1"]);
    state().undo();
    expect(state().selectedClipIds).toEqual([]);
  });
});
