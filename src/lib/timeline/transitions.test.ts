import { describe, expect, it } from "vitest";

import {
  activeTransitionAt,
  activeTransitionsAt,
  audioClipFor,
  DEFAULT_TRANSITION_SECONDS,
  effectiveTransition,
  MAX_TRANSITION_SECONDS,
  previousClip,
  setAllTransitions,
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

describe("activeTransitionsAt", () => {
  const onTrack = (trackId: string, prefix: string) => [
    photo(prefix + "1", 0, 4, { trackId }),
    photo(prefix + "2", 4, 4, { trackId, transition: { type: "fade", duration: 1 } }),
  ];

  it("lists the transitions of every track that has one right now", () => {
    const project = makeProject(makeStandardTracks(), [...onTrack("t1", "m"), ...onTrack("t2", "o")]);
    const active = activeTransitionsAt(project, 3.5);
    expect(active.map((a) => a.incoming.id).sort()).toEqual(["m2", "o2"]);
  });

  it("leaves out a track that is hidden, so it cannot hide another track's transition", () => {
    const tracks = makeStandardTracks().map((t) => (t.id === "t2" ? { ...t, hidden: true } : t));
    const project = makeProject(tracks, [...onTrack("t2", "o"), ...onTrack("t1", "m")]);
    expect(activeTransitionsAt(project, 3.5).map((a) => a.incoming.id)).toEqual(["m2"]);
  });

  it("is empty outside every transition", () => {
    const project = makeProject(makeStandardTracks(), onTrack("t1", "m"));
    expect(activeTransitionsAt(project, 1)).toEqual([]);
  });
});

describe("setAllTransitions", () => {
  const three = () =>
    makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 4, 4), photo("c", 8, 4, { transition: { type: "dip", duration: 1.5 } })]);

  it("puts the same transition into every clip that has a clip before it, and not the first", () => {
    const result = setAllTransitions(three(), { type: "slide-left", duration: 0.8 });
    expect(result.clips.map((c) => c.transition ?? null)).toEqual([
      null,
      { type: "slide-left", duration: 0.8 },
      { type: "slide-left", duration: 0.8 },
    ]);
  });

  it("takes them all away with null", () => {
    const result = setAllTransitions(three(), null);
    expect(result.clips.every((c) => (c.transition ?? null) === null)).toBe(true);
  });

  it("leaves locked clips and clips with nothing directly before them alone", () => {
    const project = makeProject(makeStandardTracks(), [photo("a", 0, 4), photo("b", 6, 4), photo("c", 10, 4, { locked: true })]);
    const result = setAllTransitions(project, { type: "fade", duration: 1 });
    expect(result.clips.map((c) => c.transition ?? null)).toEqual([null, null, null]);
  });

  it("returns the same project when nothing changes", () => {
    const once = setAllTransitions(three(), { type: "fade", duration: 1 });
    expect(setAllTransitions(once, { type: "fade", duration: 1 })).toBe(once);
  });
});

describe("audioClipFor", () => {
  const video = (id: string, start: number, extra: Partial<Clip> = {}) =>
    makeClip({ id, trackId: "t1", kind: "video", start, sourceIn: 0, sourceOut: 4, sourceDuration: 50, ...extra });

  it("fades the sound out over the transition that leaves the clip, and in over the one that brings it in", () => {
    const project = makeProject(makeStandardTracks(), [
      video("a", 0),
      video("b", 4, { transition: { type: "fade", duration: 1 } }),
      video("c", 8, { transition: { type: "slide-left", duration: 0.5 } }),
    ]);
    const [a, b, c] = project.clips;
    expect(audioClipFor(project, a)).toMatchObject({ fadeIn: 0, fadeOut: 1 });
    expect(audioClipFor(project, b)).toMatchObject({ fadeIn: 1, fadeOut: 0.5 });
    expect(audioClipFor(project, c)).toMatchObject({ fadeIn: 0.5, fadeOut: 0 });
  });

  it("keeps a longer fade the user set, and returns the clip itself when there is no transition", () => {
    const project = makeProject(makeStandardTracks(), [
      video("a", 0, { fadeOut: 3 }),
      video("b", 4, { transition: { type: "fade", duration: 1 } }),
    ]);
    expect(audioClipFor(project, project.clips[0]).fadeOut).toBe(3);
    const plain = makeProject(makeStandardTracks(), [video("a", 0), video("b", 4)]);
    expect(audioClipFor(plain, plain.clips[0])).toBe(plain.clips[0]);
  });
});
