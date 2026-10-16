import { describe, expect, it } from "vitest";

import { createTransport } from "@/lib/engine/transport";

function setup(duration = 20) {
  const clock = { now: 0, duration };
  const transport = createTransport({ now: () => clock.now, duration: () => clock.duration });
  return { clock, transport };
}

describe("play / pause", () => {
  it("starts paused at 0", () => {
    const { transport } = setup();
    expect(transport.time()).toBe(0);
    expect(transport.isPlaying()).toBe(false);
  });

  it("advances with the clock while playing and freezes when paused", () => {
    const { clock, transport } = setup();
    transport.play();
    clock.now = 2;
    expect(transport.time()).toBe(2);
    clock.now = 3;
    transport.pause();
    clock.now = 10;
    expect(transport.time()).toBe(3);
    expect(transport.isPlaying()).toBe(false);
  });

  it("resumes from where it paused", () => {
    const { clock, transport } = setup();
    transport.play();
    clock.now = 3;
    transport.pause();
    clock.now = 10;
    transport.play();
    clock.now = 12;
    expect(transport.time()).toBe(5);
  });

  it("toggle flips between playing and paused", () => {
    const { transport } = setup();
    transport.toggle();
    expect(transport.isPlaying()).toBe(true);
    transport.toggle();
    expect(transport.isPlaying()).toBe(false);
  });

  it("does nothing on an empty project", () => {
    const { transport } = setup(0);
    transport.play();
    expect(transport.isPlaying()).toBe(false);
    expect(transport.time()).toBe(0);
  });
});

describe("the end", () => {
  it("clamps at the duration and tick stops playback once", () => {
    const { clock, transport } = setup(5);
    transport.play();
    clock.now = 9;
    expect(transport.time()).toBe(5);
    expect(transport.tick()).toEqual({ time: 5, ended: true });
    expect(transport.isPlaying()).toBe(false);
    expect(transport.tick()).toEqual({ time: 5, ended: false });
  });

  it("play at the end restarts from 0", () => {
    const { clock, transport } = setup(5);
    transport.play();
    clock.now = 9;
    transport.tick();
    clock.now = 20;
    transport.play();
    expect(transport.time()).toBe(0);
    clock.now = 21;
    expect(transport.time()).toBe(1);
  });

  it("tick reports the time without ending while time remains", () => {
    const { clock, transport } = setup(5);
    transport.play();
    clock.now = 2;
    expect(transport.tick()).toEqual({ time: 2, ended: false });
  });

  it("follows a duration that shrinks mid-playback", () => {
    const { clock, transport } = setup(20);
    transport.play();
    clock.now = 8;
    clock.duration = 6; // the user deleted a clip
    expect(transport.time()).toBe(6);
    expect(transport.tick().ended).toBe(true);
  });

  it("clamps a paused position when the duration shrinks", () => {
    const { clock, transport } = setup(20);
    transport.seek(15);
    clock.duration = 10;
    expect(transport.time()).toBe(10);
  });
});

describe("seek", () => {
  it("clamps to [0, duration]", () => {
    const { transport } = setup(20);
    transport.seek(-5);
    expect(transport.time()).toBe(0);
    transport.seek(99);
    expect(transport.time()).toBe(20);
  });

  it("keeps playing from the new position", () => {
    const { clock, transport } = setup(20);
    transport.play();
    clock.now = 2;
    transport.seek(10);
    expect(transport.time()).toBe(10);
    clock.now = 3;
    expect(transport.time()).toBe(11);
    expect(transport.isPlaying()).toBe(true);
  });
});

describe("stepFrame", () => {
  const fps = 30;

  it("steps forward and backward on the frame grid", () => {
    const { transport } = setup();
    transport.stepFrame(1, fps);
    expect(transport.time()).toBeCloseTo(1 / 30, 9);
    transport.stepFrame(1, fps);
    expect(transport.time()).toBeCloseTo(2 / 30, 9);
    transport.stepFrame(-1, fps);
    expect(transport.time()).toBeCloseTo(1 / 30, 9);
  });

  it("snaps to the grid when starting between frames", () => {
    const { transport } = setup();
    transport.seek(0.04); // between frame 1 (0.0333) and frame 2 (0.0667)
    transport.stepFrame(1, fps);
    expect(transport.time()).toBeCloseTo(2 / 30, 9);
    transport.seek(0.04);
    transport.stepFrame(-1, fps);
    expect(transport.time()).toBeCloseTo(1 / 30, 9);
  });

  it("clamps at 0 and at the duration", () => {
    const { transport } = setup(1);
    transport.stepFrame(-1, fps);
    expect(transport.time()).toBe(0);
    transport.seek(1);
    transport.stepFrame(1, fps);
    expect(transport.time()).toBe(1);
  });

  it("pauses playback", () => {
    const { clock, transport } = setup();
    transport.play();
    clock.now = 1;
    transport.stepFrame(1, fps);
    expect(transport.isPlaying()).toBe(false);
  });
});
