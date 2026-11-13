import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAutosaver } from "@/lib/sync/autosaver";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosaver", () => {
  it("debounces: many schedules inside the delay produce one save", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(60);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(60);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush saves immediately and does not save a second time later", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending resolves without saving", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("cancel drops a pending save", async () => {
    const save = vi.fn(async () => {});
    const saver = createAutosaver({ save, delayMs: 100 });
    saver.schedule();
    saver.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });

  it("runs one follow-up save when an edit arrives mid-save, never two at once", async () => {
    let release: () => void = () => {};
    let running = 0;
    let maxRunning = 0;
    const save = vi.fn(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      running -= 1;
    });
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1); // first save still in flight

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(running).toBe(0);
    expect(maxRunning).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush waits for an in-flight save and its follow-up", async () => {
    let release: () => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const saver = createAutosaver({ save, delayMs: 100 });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    saver.schedule();

    let flushed = false;
    const flushing = saver.flush().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);

    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await flushing;
    expect(flushed).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected save through onError and stays usable", async () => {
    const onError = vi.fn();
    let calls = 0;
    const save = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
    });
    const saver = createAutosaver({ save, delayMs: 100, onError });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("is not wedged by a save that throws synchronously", async () => {
    const onError = vi.fn();
    const save = vi.fn((): Promise<void> => {
      throw new Error("sync boom");
    });
    const saver = createAutosaver({ save, delayMs: 100, onError });

    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(100);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
