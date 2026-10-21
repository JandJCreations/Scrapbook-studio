import { describe, expect, it } from "vitest";

import type { MediaSyncPlan } from "@/lib/engine/media-sync";
import type { SlotState } from "@/lib/engine/slots";
import { createTransport } from "@/lib/engine/transport";
import { createPlaybackEngine, type FrameInfo, type PlaybackEngine } from "@/lib/playback/engine";
import type { MediaPool } from "@/lib/playback/media-pool";
import { projectDuration } from "@/lib/timeline/clip-math";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

const projectWith = (id = "a") =>
  makeProject(makeStandardTracks(), [
    makeClip({ id, mediaId: "m", sourceIn: 0, sourceOut: 10, sourceDuration: 100 }),
  ]);

function setup(
  initial: TimelineProject = projectWith(),
  hooks: { onFrame?: (frame: FrameInfo, engine: PlaybackEngine) => void } = {},
) {
  let project = initial;
  const clock = { now: 0 };
  const transport = createTransport({ now: () => clock.now, duration: () => projectDuration(project) });

  const applied: MediaSyncPlan[] = [];
  const poolState = { slots: [] as SlotState[], disposed: 0, applyError: null as Error | null };
  const pool: MediaPool = {
    slots: () => poolState.slots,
    apply: (plan) => {
      if (poolState.applyError) {
        const error = poolState.applyError;
        poolState.applyError = null;
        throw error;
      }
      applied.push(plan);
    },
    elementForClip: () => undefined,
    dispose: () => {
      poolState.disposed += 1;
    },
  };

  const queue: Array<() => void> = [];
  const scheduler = { cancelled: 0 };
  const schedule = (callback: () => void) => {
    queue.push(callback);
    return () => {
      scheduler.cancelled += 1;
      const index = queue.indexOf(callback);
      if (index >= 0) queue.splice(index, 1);
    };
  };

  const frames: FrameInfo[] = [];
  const holder: { engine?: PlaybackEngine } = {};
  const engine = createPlaybackEngine({
    transport,
    getProject: () => project,
    pool,
    schedule,
    onFrame: (frame) => {
      frames.push(frame);
      if (holder.engine) hooks.onFrame?.(frame, holder.engine);
    },
  });
  holder.engine = engine;

  return {
    clock,
    transport,
    engine,
    applied,
    poolState,
    frames,
    scheduler,
    pending: () => queue.length,
    runNext: () => queue.shift()?.(),
    setProject: (next: TimelineProject) => {
      project = next;
    },
  };
}

describe("createPlaybackEngine", () => {
  it("runs exactly one frame when woken while paused, and schedules nothing", () => {
    const s = setup();
    s.engine.wake();
    expect(s.applied).toHaveLength(1);
    expect(s.frames).toEqual([{ time: 0, playing: false, ended: false }]);
    expect(s.pending()).toBe(0);
    expect(s.applied[0].commands[0]).toMatchObject({ clipId: "a", play: false });
  });

  it("keeps running frames while playing, reflecting the clock", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    expect(s.pending()).toBe(1);

    s.clock.now = 0.5;
    s.runNext();
    expect(s.frames[s.frames.length - 1]).toEqual({ time: 0.5, playing: true, ended: false });
    expect(s.pending()).toBe(1);
    expect(s.applied[1].commands[0]).toMatchObject({ clipId: "a", play: true });
  });

  it("runs a final frame when paused, so elements are told to pause, then stops", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.transport.pause();
    s.engine.wake();

    expect(s.frames[s.frames.length - 1].playing).toBe(false);
    expect(s.applied[s.applied.length - 1].commands[0]).toMatchObject({ play: false });
    expect(s.pending()).toBe(0);
  });

  it("reports the end once and stops scheduling", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.clock.now = 12;
    s.runNext();

    expect(s.frames[s.frames.length - 1]).toEqual({ time: 10, playing: false, ended: true });
    expect(s.pending()).toBe(0);
  });

  it("cancels the pending frame and runs one now when woken while playing", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.engine.wake();

    expect(s.scheduler.cancelled).toBe(1);
    expect(s.frames).toHaveLength(2);
    expect(s.pending()).toBe(1);
  });

  it("plans from the pool's real slot state", () => {
    const s = setup();
    s.poolState.slots = [{ id: "s1", kind: "video", mediaId: "m", clipId: "a", currentTime: 0 }];
    s.engine.wake();
    expect(s.applied[0].commands[0]).toMatchObject({ slotId: "s1", load: false });
  });

  it("reads the project fresh every frame", () => {
    const s = setup(projectWith("a"));
    s.engine.wake();
    s.setProject(projectWith("b"));
    s.engine.wake();
    expect(s.applied[1].commands[0].clipId).toBe("b");
  });

  it("stops everything on dispose", () => {
    const s = setup();
    s.transport.play();
    s.engine.wake();
    s.engine.dispose();

    expect(s.scheduler.cancelled).toBe(1);
    expect(s.poolState.disposed).toBe(1);
    expect(s.pending()).toBe(0);

    const framesBefore = s.frames.length;
    s.engine.wake();
    expect(s.frames).toHaveLength(framesBefore);
  });
});

describe("createPlaybackEngine: resilience", () => {
  it("keeps the loop alive when drawing throws", () => {
    let throwOnce = true;
    const s = setup(projectWith(), {
      onFrame: () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error("draw failed");
        }
      },
    });
    s.transport.play();

    expect(() => s.engine.wake()).toThrow("draw failed");
    expect(s.pending()).toBe(1);
    expect(() => s.runNext()).not.toThrow();
    expect(s.frames).toHaveLength(2);
  });

  it("keeps the loop alive when applying the plan throws", () => {
    const s = setup();
    s.transport.play();
    s.poolState.applyError = new Error("apply failed");

    expect(() => s.engine.wake()).toThrow("apply failed");
    expect(s.pending()).toBe(1);
    s.runNext();
    expect(s.applied).toHaveLength(1);
  });

  it("leaves a single loop when wake is called from inside onFrame", () => {
    let rewoke = false;
    const s = setup(projectWith(), {
      onFrame: (_frame, engine) => {
        if (!rewoke) {
          rewoke = true;
          engine.wake();
        }
      },
    });
    s.transport.play();
    s.engine.wake();
    expect(s.pending()).toBe(1);

    s.transport.pause();
    s.engine.wake();
    expect(s.pending()).toBe(0);
  });
});
