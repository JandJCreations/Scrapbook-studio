import { describe, expect, it } from "vitest";

import {
  activeTransitionAt,
  DEFAULT_TRANSITION_SECONDS,
  effectiveTransition,
  MAX_TRANSITION_SECONDS,
  previousClip,
  setTransition,
} from "@/lib/timeline/transitions";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { Clip } from "@/types/timeline";

const photo = (id: string, start: number, length: number, extra: Partial<Clip> = {}) =>
  makeClip({ id, trackId: "t1", kind: "image", sourceDuration: null, start, sourceIn: 0, sourceOut: length, ...extra });

const fade = (duration = 1) => ({ type: "fade" as const, duration });

describe("previousClip", () => {
  it("is the clip that ends exactly where this one starts, on the same track", () => {
    const project = makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 4, 4)]);
    expect(previousClip(project, project.clips[1])?.id).toBe("a");
    expect(previousClip(project, project.clips[0])).toBeNull();
  });

  it("is nothing when there is a gap, or the neighbour is on another track", () => {
    const gap = makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 5, 4)]);
    expect(previousClip(gap, gap.clips[1])).toBeNull();
    const other = makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 4, 4, { trackId: "t2" })]);
    expect(previousClip(other, other.clips[1])).toBeNull();
  });
});

describe("effectiveTransition", () => {
  it("is null without a transition or without a previous clip", () => {
    const none = makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 4, 4)]);
    expect(effectiveTransition(none, none.clips[1])).toBeNull();
    const first = makeProject(makeStandardTracks(), [photo("a", 0, 4, { transition: fade() })]);
    expect(effectiveTransition(first, first.clips[0])).toBeNull();
  });

  it("keeps the duration within the limits and within both clips", () => {
    const project = makeProject(makeStandardTracks(), [
      photo("a", 0, 0.5),
      photo("b", 0.5, 10, { transition: fade(99) }),
    ]);
    expect(effectiveTransition(project, project.clips[1])?.duration).toBeCloseTo(0.5);
    const long = makeProject(makeStandardTracks(), [photo("a", 0, 10), photo("b", 10, 10, { transition: fade(99) })]);
    expect(effectiveTransition(long, long.clips[1])?.duration).toBe(MAX_TRANSITION_SECONDS);
  });
});

describe("activeTransitionAt", () => {
  const project = makeProject(makeStandardTracks(), [
    photo("a", 0, 4),
    photo("b", 4, 4, { transition: { type: "slide-left", duration: 1 } }),
  ]);

  it("covers the last stretch of the outgoing clip, with progress from 0 to 1", () => {
    expect(activeTransitionAt(project, 2.9)).toBeNull();
    const start = activeTransitionAt(project, 3)!;
    expect(start.progress).toBeCloseTo(0);
    expect(start.incoming.id).toBe("b");
    expect(start.outgoing.id).toBe("a");
    expect(start.type).toBe("slide-left");
    expect(activeTransitionAt(project, 3.5)!.progress).toBeCloseTo(0.5);
  });

  it("is over once the incoming clip owns the instant", () => {
    expect(activeTransitionAt(project, 4)).toBeNull();
    expect(activeTransitionAt(project, 6)).toBeNull();
  });

  it("is nothing for a project without transitions", () => {
    expect(activeTransitionAt(makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 4, 4)]), 3.5)).toBeNull();
  });
});

describe("setTransition", () => {
  const two = () => makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 4, 4)]);

  it("sets and clears a transition on a clip that has a previous clip", () => {
    const set = setTransition(two(), "b", { type: "dip", duration: 0.8 });
    expect(set.clips[1].transition).toEqual({ type: "dip", duration: 0.8 });
    const cleared = setTransition(set, "b", null);
    expect(cleared.clips[1].transition ?? null).toBeNull();
  });

  it("clamps the duration into the allowed range", () => {
    expect(setTransition(two(), "b", fade(99)).clips[1].transition?.duration).toBe(MAX_TRANSITION_SECONDS);
    expect(setTransition(two(), "b", fade(0)).clips[1].transition?.duration).toBeGreaterThan(0);
  });

  it("does nothing for the first clip, an unknown clip, a locked clip or no change", () => {
    const project = two();
    expect(setTransition(project, "a", fade())).toBe(project);
    expect(setTransition(project, "missing", fade())).toBe(project);
    expect(setTransition(project, "b", null)).toBe(project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(setTransition(locked, "b", fade())).toBe(locked);
    const same = setTransition(project, "b", fade(DEFAULT_TRANSITION_SECONDS));
    expect(setTransition(same, "b", fade(DEFAULT_TRANSITION_SECONDS))).toBe(same);
  });
});
