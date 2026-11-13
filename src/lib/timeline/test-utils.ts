import type { Clip, TimelineProject, Track } from "@/types/timeline";

export function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "t1",
    type: "video",
    order: 0,
    muted: false,
    locked: false,
    hidden: false,
    solo: false,
    ...overrides,
  };
}

export function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    trackId: "t1",
    kind: "video",
    name: "clip",
    mediaId: "m1",
    sourceDuration: 20,
    start: 0,
    sourceIn: 0,
    sourceOut: 10,
    speed: 1,
    reversed: false,
    loop: false,
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1 },
    adjustments: { photo: null, video: null, text: null },
    keyframes: [],
    groupId: null,
    locked: false,
    isPlaceholder: false,
    ...overrides,
  };
}

export function makeProject(tracks: Track[], clips: Clip[]): TimelineProject {
  return { id: "p1", tracks, clips };
}

/** Overlay `t2` (top), video `t1` (main), audio `t3` (bottom). */
export function makeStandardTracks(): Track[] {
  return [
    makeTrack({ id: "t2", type: "overlay", order: 0 }),
    makeTrack({ id: "t1", type: "video", order: 1 }),
    makeTrack({ id: "t3", type: "audio", order: 2 }),
  ];
}

export function getClip(project: TimelineProject, id: string): Clip {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip) throw new Error(`No clip with id ${id}`);
  return clip;
}

/** Deterministic id generator: id-1, id-2, ... */
export function seqIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
