import { describe, expect, it } from "vitest";

import { createTransport } from "@/lib/engine/transport";
import { createPlaybackEngine, type FrameInfo } from "@/lib/playback/engine";
import { createMediaPool } from "@/lib/playback/media-pool";
import { makeFakePoolDeps } from "@/lib/playback/test-utils";
import { projectDuration } from "@/lib/timeline/clip-math";
import { splitClip } from "@/lib/timeline/split";
import { makeClip, makeProject, makeStandardTracks, seqIds } from "@/lib/timeline/test-utils";
import type { Clip, TimelineProject } from "@/types/timeline";

const clip = (id: string, overrides: Partial<Clip> = {}) =>
  makeClip({ id, mediaId: "m", sourceDuration: 100, ...overrides });

const DT = 1 / 60;

/** The real engine and pool over fake elements that advance like a browser's. */
function simulate(project: TimelineProject) {
  const clock = { now: 0 };
  const transport = createTransport({ now: () => clock.now, duration: () => projectDuration(project) });
  const fake = makeFakePoolDeps();
  const pool = createMediaPool(fake.deps);

  const queue: Array<() => void> = [];
  const frames: FrameInfo[] = [];
  const engine = createPlaybackEngine({
    transport,
    getProject: () => project,
    pool,
    schedule: (callback) => {
      queue.push(callback);
      return () => {
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    onFrame: (frame) => frames.push(frame),
  });

  /** One browser frame: time passes, playing elements advance, then the frame callback runs. */
  function step(seconds = DT) {
    clock.now += seconds;
    for (const { element } of fake.created) element.advance(seconds);
    queue.shift()?.();
  }

  function playToEnd(limit = 3000) {
    transport.play();
    engine.wake();
    for (let i = 0; i < limit && transport.isPlaying(); i++) step();
  }

  return { clock, transport, fake, pool, engine, frames, step, playToEnd };
}

describe("end-to-end: a clip split into pieces plays on one element", () => {
  it("creates one element, loads once and seeks only to the start, across two real splits", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0.1, sourceOut: 3.1 }),
    ]);
    let project = splitClip(base, "a", 0.3, seqIds("s"));
    project = splitClip(project, "s-1", 1.0, seqIds("t"));
    expect(project.clips).toHaveLength(3);

    const sim = simulate(project);
    sim.playToEnd();

    expect(sim.fake.created).toHaveLength(1);
    const { element } = sim.fake.created[0];
    expect(element.srcSets).toBe(1);
    expect(element.seeks).toHaveLength(1);
    expect(element.seeks[0]).toBeCloseTo(0.1, 6);
    expect(sim.frames[sim.frames.length - 1].ended).toBe(true);
  });

  it("holds at other frame rates and at a non-unit speed", () => {
    const base = makeProject(makeStandardTracks(), [
      clip("a", { start: 0, sourceIn: 0, sourceOut: 6, speed: 2 }),
    ]);
    let project = splitClip(base, "a", 0.7, seqIds("s"));
    project = splitClip(project, "s-1", 1.9, seqIds("t"));

    for (const dt of [1 / 24, 1 / 30, 1 / 60, 1 / 120]) {
      const sim = simulate(project);
      sim.transport.play();
      sim.engine.wake();
      for (let i = 0; i < 5000 && sim.transport.isPlaying(); i++) sim.step(dt);

      expect(sim.fake.created).toHaveLength(1);
      expect(sim.fake.created[0].element.srcSets).toBe(1);
      expect(sim.fake.created[0].element.seeks).toHaveLength(1);
      expect(sim.fake.created[0].element.playbackRate).toBe(2);
    }
  });
});

describe("end-to-end: a cut between two files", () => {
  it("prepares the next file ahead of the cut and is already playing at it", () => {
    const project = makeProject(makeStandardTracks(), [
      clip("a", { mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 2 }),
      clip("b", { mediaId: "m2", start: 2, sourceIn: 0, sourceOut: 2 }),
    ]);
    const sim = simulate(project);
    sim.transport.play();
    sim.engine.wake();

    let secondCreatedAt: number | null = null;
    let atCut: { paused: boolean; position: number } | null = null;
    for (let i = 0; i < 1000 && sim.transport.isPlaying(); i++) {
      sim.step();
      if (sim.fake.created.length === 2 && secondCreatedAt === null) secondCreatedAt = sim.clock.now;
      if (atCut === null && sim.clock.now >= 2 && sim.fake.created.length === 2) {
        const second = sim.fake.created[1].element;
        atCut = { paused: second.paused, position: second.currentTime - (sim.clock.now - 2) };
      }
    }

    expect(sim.fake.created).toHaveLength(2);
    expect(secondCreatedAt).toBeGreaterThanOrEqual(0.99);
    expect(secondCreatedAt).toBeLessThan(1.1);
    expect(sim.fake.created[1].element.srcSets).toBe(1);
    expect(sim.fake.created[1].element.seeks).toHaveLength(1);
    expect(atCut?.paused).toBe(false);
    expect(Math.abs(atCut?.position ?? 99)).toBeLessThan(0.05);
  });
});

describe("end-to-end: pausing, scrubbing and stepping", () => {
  const single = () =>
    makeProject(makeStandardTracks(), [clip("a", { start: 0, sourceIn: 0, sourceOut: 10 })]);

  it("pauses the element, follows a seek, and follows a single-frame step", () => {
    const sim = simulate(single());
    sim.transport.play();
    sim.engine.wake();
    for (let i = 0; i < 60; i++) sim.step();

    const { element } = sim.fake.created[0];
    sim.transport.pause();
    sim.engine.wake();
    expect(element.paused).toBe(true);

    sim.transport.seek(5);
    sim.engine.wake();
    expect(element.currentTime).toBeCloseTo(5, 9);

    sim.transport.stepFrame(1, 60);
    sim.engine.wake();
    expect(element.currentTime).toBeCloseTo(301 / 60, 9);
  });

  it("leaves every element paused and silent once playback ends", () => {
    const sim = simulate(single());
    sim.playToEnd();

    const { element } = sim.fake.created[0];
    expect(element.paused).toBe(true);
    expect(sim.fake.gains.get(element)?.last).toBe(0);
  });
});
