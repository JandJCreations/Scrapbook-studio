import { describe, expect, it } from "vitest";

import type { FrameInfo } from "@/lib/playback/engine";
import type { PoolElement, PoolProblem } from "@/lib/playback/media-pool";
import { createPlaybackSession } from "@/lib/playback/session";
import { FakeAudioContext, FakeElement } from "@/lib/playback/test-utils";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

const oneClip = () =>
  makeProject(makeStandardTracks(), [
    makeClip({ id: "a", mediaId: "m", sourceIn: 0, sourceOut: 4, sourceDuration: 100 }),
  ]);

function setup(options: { project?: TimelineProject; urlFor?: (id: string) => string | null } = {}) {
  const project = options.project ?? oneClip();
  const clock = { now: 0 };
  const ctx = new FakeAudioContext();
  ctx.state = "suspended";

  const elements: FakeElement[] = [];
  const queue: Array<() => void> = [];
  const frames: FrameInfo[] = [];
  const problems: PoolProblem[] = [];
  const counters = { disposed: 0, cancelled: 0 };

  const session = createPlaybackSession({
    getProject: () => project,
    audioContext: ctx,
    createElement: () => {
      const element = new FakeElement();
      elements.push(element);
      return element;
    },
    urlFor: options.urlFor ?? ((id) => `blob:${id}`),
    now: () => clock.now,
    schedule: (callback) => {
      queue.push(callback);
      return () => {
        counters.cancelled += 1;
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    onFrame: (frame) => frames.push(frame),
    onProblem: (problem) => problems.push(problem),
    onDispose: () => {
      counters.disposed += 1;
    },
  });

  return {
    session,
    clock,
    ctx,
    elements,
    frames,
    problems,
    counters,
    pending: () => queue.length,
    runNext: () => queue.shift()?.(),
  };
}

describe("createPlaybackSession: play", () => {
  it("resumes the audio, starts the transport and runs a frame before play() returns", () => {
    const s = setup();
    s.session.play();

    // All of this happened synchronously, i.e. inside the user's click.
    expect(s.ctx.resumed).toBe(1);
    expect(s.session.transport.isPlaying()).toBe(true);
    expect(s.frames).toHaveLength(1);
    expect(s.frames[0].playing).toBe(true);
    expect(s.elements).toHaveLength(1);
    expect(s.elements[0].playCalls).toBe(1);
    expect(s.pending()).toBe(1);
  });

  it("keeps running frames and stops at the end, leaving elements paused", () => {
    const s = setup();
    s.session.play();
    s.clock.now = 2;
    s.runNext();
    expect(s.frames[s.frames.length - 1]).toMatchObject({ time: 2, playing: true });

    s.clock.now = 9;
    s.runNext();
    expect(s.frames[s.frames.length - 1]).toMatchObject({ time: 4, playing: false, ended: true });
    expect(s.elements[0].paused).toBe(true);
    expect(s.pending()).toBe(0);
  });

  it("toggle plays and pauses", () => {
    const s = setup();
    s.session.toggle();
    expect(s.session.transport.isPlaying()).toBe(true);
    s.session.toggle();
    expect(s.session.transport.isPlaying()).toBe(false);
  });
});

describe("createPlaybackSession: one frame per action", () => {
  it("pause, seek, step and wake each run exactly one frame", () => {
    const s = setup();
    s.session.play();
    const before = s.frames.length;

    s.session.pause();
    expect(s.frames).toHaveLength(before + 1);
    s.session.seek(2);
    expect(s.frames).toHaveLength(before + 2);
    s.session.step(1, 30);
    expect(s.frames).toHaveLength(before + 3);
    s.session.wake();
    expect(s.frames).toHaveLength(before + 4);
  });

  it("moves the element when a paused seek or frame step happens", () => {
    const s = setup();
    s.session.wake();
    s.session.seek(2);
    expect(s.elements[0].currentTime).toBeCloseTo(2, 9);
    s.session.step(1, 30);
    expect(s.elements[0].currentTime).toBeCloseTo(2 + 1 / 30, 9);
  });

  it("redraws when an element reports that a frame is ready", () => {
    const s = setup();
    s.session.wake();
    const before = s.frames.length;
    s.elements[0].emit("seeked");
    expect(s.frames).toHaveLength(before + 1);
    s.elements[0].emit("loadeddata");
    expect(s.frames).toHaveLength(before + 2);
  });
});

describe("createPlaybackSession: sound and problems", () => {
  it("connects every element to the audio graph exactly once", () => {
    const project = makeProject(makeStandardTracks(), [
      makeClip({ id: "a", mediaId: "m1", start: 0, sourceIn: 0, sourceOut: 2, sourceDuration: 100 }),
      makeClip({ id: "b", mediaId: "m2", start: 2, sourceIn: 0, sourceOut: 2, sourceDuration: 100 }),
    ]);
    const s = setup({ project });
    s.session.play();
    s.clock.now = 1.5;
    s.runNext(); // inside the lookahead window, so the second file is prepared

    expect(s.elements).toHaveLength(2);
    expect(s.ctx.sources.map((source) => source.element)).toEqual(s.elements);
  });

  it("collects and forwards problems", () => {
    const s = setup({ urlFor: () => null });
    s.session.wake();
    const expected: PoolProblem[] = [{ clipId: "a", kind: "missing-media" }];
    expect(s.session.problems()).toEqual(expected);
    expect(s.problems).toEqual(expected);
  });
});

describe("createPlaybackSession: dispose", () => {
  it("stops the loop, silences elements, closes the audio and runs the cleanup once", async () => {
    const s = setup();
    s.session.play();
    expect(s.pending()).toBe(1);

    await s.session.dispose();
    expect(s.counters.cancelled).toBe(1);
    expect(s.pending()).toBe(0);
    expect(s.elements[0].paused).toBe(true);
    expect(s.elements[0].src).toBe("");
    expect(s.ctx.closed).toBe(1);
    expect(s.counters.disposed).toBe(1);

    await s.session.dispose();
    expect(s.ctx.closed).toBe(1);
    expect(s.counters.disposed).toBe(1);
  });

  it("does nothing on a later action", async () => {
    const s = setup();
    await s.session.dispose();
    const before = s.frames.length;
    s.session.wake();
    s.session.seek(1);
    expect(s.frames).toHaveLength(before);
  });
});

// Compile-time check: the session accepts a real media element factory.
const realFactoryFits = (create: () => HTMLMediaElement): (() => PoolElement) => create;
void realFactoryFits;
