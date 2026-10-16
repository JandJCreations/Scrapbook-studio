import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryTimelineStorage } from "@/lib/sync/test-utils";
import { TimelineDocumentError } from "@/lib/sync/timeline-document";
import { createTimelineSync, type SyncStatus } from "@/lib/sync/timeline-sync";
import { moveClip } from "@/lib/timeline/place";
import { getClip } from "@/lib/timeline/test-utils";
import {
  EMPTY_PROJECT,
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";

const DELAY = 100;
const RETRY = 50;

const store = () => useClipProjectStore.getState();

/** Always produces a new project reference, whatever the content. */
const touch = () => store().apply((p) => ({ ...p, clips: [...p.clips] }));

function setup(storage: MemoryTimelineStorage, maxLoadAttempts = 3) {
  const statuses: SyncStatus[] = [];
  const sync = createTimelineSync({
    projectId: "p1",
    storage,
    getSavable: () => selectSavableProject(useClipProjectStore.getState()),
    subscribe: (listener) => useClipProjectStore.subscribe(listener),
    loadProject: (project) => useClipProjectStore.getState().load(project),
    onStatus: (status) => statuses.push(status),
    delayMs: DELAY,
    maxLoadAttempts,
    retryDelayMs: RETRY,
  });
  return { sync, statuses };
}

const phases = (statuses: SyncStatus[]) => statuses.map((s) => s.phase);

let active: { stop: () => Promise<void> } | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  store().load(EMPTY_PROJECT);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await active?.stop();
  active = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function start(storage: MemoryTimelineStorage, maxLoadAttempts = 3) {
  const made = setup(storage, maxLoadAttempts);
  active = made.sync;
  made.sync.load();
  await vi.advanceTimersByTimeAsync(0);
  return made;
}

describe("loading", () => {
  it("loads the remote project into the store and becomes ready without saving", async () => {
    const storage = new MemoryTimelineStorage();
    const { statuses } = await start(storage);

    expect(phases(statuses)).toEqual(["loading", "ready"]);
    expect(selectProject(store())).toBe(storage.project);

    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(0);
  });

  it("retries transient load failures", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadFailures = 2;
    const { statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(200);

    expect(storage.loadCalls).toBe(3);
    expect(phases(statuses)).toEqual(["loading", "ready"]);
  });

  it("gives up after the maximum attempts and never saves in the error phase", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadFailures = 99;
    const { statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(500);

    expect(storage.loadCalls).toBe(3);
    expect(statuses[statuses.length - 1]).toMatchObject({ phase: "error", error: "network down" });

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(0);
  });

  it("can be retried after an error", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadFailures = 99;
    const { sync, statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(500);

    storage.loadFailures = 0;
    sync.load();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses[statuses.length - 1].phase).toBe("ready");
  });

  it("treats a malformed document as permanent: no retry, no save", async () => {
    const storage = new MemoryTimelineStorage();
    storage.loadError = new TimelineDocumentError("bad document");
    const { statuses } = await start(storage);
    await vi.advanceTimersByTimeAsync(500);

    expect(storage.loadCalls).toBe(1);
    expect(statuses[statuses.length - 1]).toMatchObject({ phase: "error", error: "bad document" });

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(0);
  });

  it("never saves edits made to the store before the load finishes", async () => {
    const storage = new MemoryTimelineStorage();
    let open: () => void = () => {};
    storage.loadGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { sync } = setup(storage);
    active = sync;
    sync.load();

    touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(0);

    open();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(0);
  });
});

describe("autosave", () => {
  it("saves the edited project once after the delay, at the loaded revision", async () => {
    const storage = new MemoryTimelineStorage();
    await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 8 }));
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(storage.saveAttempts).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0].expectedRev).toBe(0);
    expect(storage.rev).toBe(1);
    expect(getClip(storage.project, "o").start).toBe(8);
  });

  it("collapses rapid edits into one save of the latest state", async () => {
    const storage = new MemoryTimelineStorage();
    await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 5 }));
    store().apply((p) => moveClip(p, "o", { start: 6 }));
    store().apply((p) => moveClip(p, "o", { start: 7 }));
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(storage.saves).toHaveLength(1);
    expect(getClip(storage.project, "o").start).toBe(7);
  });

  it("does not save a drag in progress, only its committed result", async () => {
    const storage = new MemoryTimelineStorage();
    await start(storage);

    store().previewApply((p) => moveClip(p, "o", { start: 5 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(0);

    store().endGesture();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saves).toHaveLength(1);
    expect(getClip(storage.project, "o").start).toBe(5);
  });

  it("saves an edit made during a save afterwards, one at a time, with sequential revisions", async () => {
    const storage = new MemoryTimelineStorage();
    let open: () => void = () => {};
    storage.saveGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 5 }));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saveAttempts).toBe(1);

    store().apply((p) => moveClip(p, "o", { start: 9 }));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saveAttempts).toBe(1);

    open();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(storage.saves.map((s) => s.expectedRev)).toEqual([0, 1]);
    expect(storage.maxInFlightSaves).toBe(1);
    expect(getClip(storage.project, "o").start).toBe(9);
  });

  it("stops autosaving after a conflict until reloaded", async () => {
    const storage = new MemoryTimelineStorage();
    const { sync, statuses } = await start(storage);

    storage.rev = 5; // someone else saved
    touch();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(statuses[statuses.length - 1].phase).toBe("conflict");
    expect(storage.saveAttempts).toBe(1);

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saveAttempts).toBe(1);

    sync.load();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses[statuses.length - 1].phase).toBe("ready");

    touch();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0].expectedRev).toBe(5);
  });

  it("retries a failing save a few times, then waits for the next edit", async () => {
    const storage = new MemoryTimelineStorage();
    storage.saveFailures = Infinity;
    await start(storage);

    touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.saveAttempts).toBe(4); // first try + 3 retries, then it stops

    storage.saveFailures = 0;
    touch();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(storage.saves).toHaveLength(1);
  });
});

describe("stop and flush", () => {
  it("stop saves a pending edit immediately and then ignores further edits", async () => {
    const storage = new MemoryTimelineStorage();
    const { sync } = await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 8 }));
    await sync.stop();
    expect(storage.saves).toHaveLength(1);
    expect(getClip(storage.project, "o").start).toBe(8);

    touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.saves).toHaveLength(1);
  });

  it("flush saves a pending edit without waiting for the delay", async () => {
    const storage = new MemoryTimelineStorage();
    const { sync } = await start(storage);

    store().apply((p) => moveClip(p, "o", { start: 8 }));
    await sync.flush();
    expect(storage.saves).toHaveLength(1);
  });

  it("an abandoned load does not populate the store", async () => {
    const storage = new MemoryTimelineStorage();
    let open: () => void = () => {};
    storage.loadGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const { sync, statuses } = setup(storage);
    sync.load();
    await sync.stop();

    open();
    await vi.advanceTimersByTimeAsync(0);
    expect(selectProject(store())).toBe(EMPTY_PROJECT);
    expect(phases(statuses)).toEqual(["loading"]);
  });
});
