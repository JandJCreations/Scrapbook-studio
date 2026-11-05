import { describe, expect, it } from "vitest";

import {
  addAudioClip,
  addToSequence,
  fitMusicToVideo,
  musicStartTime,
  patchAudio,
  patchFades,
  patchPhotoAdjustments,
  patchVideoAdjustments,
  STILL_SECONDS,
  type EditorMedia,
} from "@/lib/editor/ops";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { clipEnd } from "@/lib/timeline/clip-math";
import { findClip } from "@/lib/timeline/lookup";
import { seqIds } from "@/lib/timeline/test-utils";

const frame = { width: 1920, height: 1080 };
const video = (mediaId: string, overrides: Partial<EditorMedia> = {}): EditorMedia => ({
  mediaId,
  name: mediaId,
  kind: "video",
  duration: 6,
  width: 1920,
  height: 1080,
  ...overrides,
});
const base = () => emptyTimeline("p", seqIds("t")); // video t-1, audio t-2

describe("addToSequence", () => {
  it("appends to the end of the main track, one after another", () => {
    const a = addToSequence(base(), video("a"), frame, seqIds("c"));
    const b = addToSequence(a.project, video("b"), frame, seqIds("d"));
    expect(b.project.clips.map((c) => [c.mediaId, c.trackId, c.start])).toEqual([
      ["a", "t-1", 0],
      ["b", "t-1", 6],
    ]);
    expect(b.clipId).toBe(findClip(b.project, b.clipId)?.id);
  });

  it("is not pushed later by longer music on another track", () => {
    const withMusic = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 60 }),
      frame,
      0,
      seqIds("m"),
    );
    const result = addToSequence(withMusic.project, video("a"), frame, seqIds("c"));
    expect(findClip(result.project, result.clipId)?.start).toBe(0);
  });

  it("fits a picture inside the frame, centred", () => {
    const square = addToSequence(
      base(),
      video("s", { width: 1000, height: 1000 }),
      frame,
      seqIds("c"),
    );
    expect(findClip(square.project, square.clipId)?.transform).toMatchObject({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    });
  });

  it("makes a still image five seconds long with no source length", () => {
    const result = addToSequence(
      base(),
      video("p", { kind: "image", duration: 0 }),
      frame,
      seqIds("c"),
    );
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "image",
      sourceDuration: null,
      sourceIn: 0,
      sourceOut: STILL_SECONDS,
    });
  });

  it("creates the main track when there is none", () => {
    const empty = { id: "p", tracks: [], clips: [] };
    const result = addToSequence(empty, video("a"), frame, seqIds("n"));
    expect(result.project.tracks.map((t) => t.type)).toEqual(["video"]);
  });

  it("sends an audio item to the audio track instead", () => {
    const result = addToSequence(
      base(),
      video("m", { kind: "audio", duration: 30 }),
      frame,
      seqIds("c"),
    );
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "audio",
      trackId: "t-2",
      start: 0,
    });
  });
});


describe("addAudioClip", () => {
  it("places music on the audio track at the requested time", () => {
    const result = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 30 }),
      frame,
      2,
      seqIds("c"),
    );
    expect(findClip(result.project, result.clipId)).toMatchObject({
      kind: "audio",
      trackId: "t-2",
      start: 2,
      sourceOut: 30,
      sourceDuration: 30,
    });
  });

  it("creates an audio track when there is none", () => {
    const noAudio = { id: "p", tracks: base().tracks.filter((t) => t.type === "video"), clips: [] };
    const result = addAudioClip(noAudio, video("m", { kind: "audio" }), frame, 0, seqIds("n"));
    expect(result.project.tracks.map((t) => t.type).sort()).toEqual(["audio", "video"]);
  });
});

describe("patchPhotoAdjustments", () => {
  const withPhoto = () =>
    addToSequence(base(), video("p", { kind: "image", duration: 0 }), frame, seqIds("c"));

  it("creates the default adjustments on first use and merges the patch", () => {
    const { project, clipId } = withPhoto();
    expect(findClip(project, clipId)?.adjustments.photo).toBeNull();
    const result = patchPhotoAdjustments(project, clipId, { brightness: 25 });
    expect(findClip(result, clipId)?.adjustments.photo).toMatchObject({
      brightness: 25,
      contrast: 0,
      borderColor: "#ffffff",
    });
  });

  it("returns the same project when nothing changes, for other kinds and for locked clips", () => {
    const { project, clipId } = withPhoto();
    expect(patchPhotoAdjustments(project, clipId, { brightness: 0 })).toBe(project);
    expect(patchPhotoAdjustments(project, "missing", { brightness: 5 })).toBe(project);
    const clip = addToSequence(base(), video("v"), frame, seqIds("d"));
    expect(patchPhotoAdjustments(clip.project, clip.clipId, { brightness: 5 })).toBe(clip.project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(patchPhotoAdjustments(locked, clipId, { brightness: 5 })).toBe(locked);
  });
});

describe("patchVideoAdjustments", () => {
  it("creates defaults sized to the source on first use", () => {
    const { project, clipId } = addToSequence(base(), video("v", { duration: 8 }), frame, seqIds("c"));
    const result = patchVideoAdjustments(project, clipId, { saturation: -30 });
    expect(findClip(result, clipId)?.adjustments.video).toMatchObject({
      saturation: -30,
      duration: 8,
      brightness: 0,
    });
  });

  it("ignores pictures and unchanged values", () => {
    const photo = addToSequence(base(), video("p", { kind: "image", duration: 0 }), frame, seqIds("c"));
    expect(patchVideoAdjustments(photo.project, photo.clipId, { blur: 2 })).toBe(photo.project);
    const vid = addToSequence(base(), video("v"), frame, seqIds("d"));
    expect(patchVideoAdjustments(vid.project, vid.clipId, { blur: 0 })).toBe(vid.project);
  });
});


describe("patchAudio", () => {
  it("changes volume, mute and fades on sound-carrying clips", () => {
    const { project, clipId } = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 30 }),
      frame,
      0,
      seqIds("c"),
    );
    const result = patchAudio(project, clipId, { volume: 40, muted: true, fadeIn: 2, fadeOut: 3 });
    expect(findClip(result, clipId)).toMatchObject({ volume: 40, muted: true, fadeIn: 2, fadeOut: 3 });
  });

  it("clamps fades to the clip length", () => {
    const { project, clipId } = addAudioClip(
      base(),
      video("m", { kind: "audio", duration: 4 }),
      frame,
      0,
      seqIds("c"),
    );
    expect(findClip(patchAudio(project, clipId, { fadeIn: 99 }), clipId)?.fadeIn).toBe(4);
  });

  it("leaves pictures and text alone", () => {
    const { project, clipId } = addToSequence(
      base(),
      video("p", { kind: "image", duration: 0 }),
      frame,
      seqIds("c"),
    );
    expect(patchAudio(project, clipId, { volume: 10 })).toBe(project);
  });
});

describe("patchFades", () => {
  const photo = (): EditorMedia => ({ mediaId: "m", name: "Beach", kind: "image", duration: 0, width: 1000, height: 1000 });
  const added = () => addToSequence(base(), photo(), frame, seqIds("n")); // 5 s

  it("sets the fades of a picture, kept inside the clip's length", () => {
    const { project, clipId } = added();
    const result = findClip(patchFades(project, clipId, { fadeIn: 1, fadeOut: 99 }), clipId)!;
    expect(result.fadeIn).toBe(1);
    expect(result.fadeOut).toBe(5);
  });

  it("leaves unknown, locked and unchanged clips alone", () => {
    const { project, clipId } = added();
    expect(patchFades(project, "missing", { fadeIn: 1 })).toBe(project);
    expect(patchFades(project, clipId, {})).toBe(project);
    const locked = { ...project, clips: project.clips.map((c) => ({ ...c, locked: true })) };
    expect(patchFades(locked, clipId, { fadeIn: 1 })).toBe(locked);
  });
});

describe("fitMusicToVideo", () => {
  const photo = (name: string): EditorMedia => ({ mediaId: name, name, kind: "image", duration: 0, width: 1000, height: 1000 });
  const song: EditorMedia = { mediaId: "song", name: "Song", kind: "audio", duration: 180, width: 0, height: 0 };

  it("cuts a long song to the length of the video", () => {
    const ids = seqIds("c");
    let project = addToSequence(emptyTimeline("p"), photo("a"), frame, ids).project;
    project = addToSequence(project, photo("b"), frame, ids).project;
    const videoEnd = 2 * STILL_SECONDS;
    const added = addAudioClip(project, song, frame, 0, ids);
    const fitted = fitMusicToVideo(added.project, added.clipId);
    expect(clipEnd(findClip(fitted, added.clipId)!)).toBeCloseTo(videoEnd);
  });

  it("leaves a song that is already shorter than the video, and an empty video, alone", () => {
    const ids = seqIds("c");
    const empty = addAudioClip(emptyTimeline("p"), song, frame, 0, ids);
    expect(fitMusicToVideo(empty.project, empty.clipId)).toBe(empty.project);
    const project = addToSequence(emptyTimeline("p"), photo("a"), frame, ids).project;
    const short = addAudioClip(project, { ...song, duration: 1 }, frame, 0, ids);
    expect(fitMusicToVideo(short.project, short.clipId)).toBe(short.project);
  });
});

describe("musicStartTime", () => {
  const photo: EditorMedia = { mediaId: "a", name: "a", kind: "image", duration: 0, width: 1000, height: 1000 };

  it("is the playhead while it is inside the video, and 0 at or past the end or with no video", () => {
    const project = addToSequence(emptyTimeline("p"), photo, frame, seqIds("c")).project;
    expect(musicStartTime(project, 2)).toBe(2);
    expect(musicStartTime(project, STILL_SECONDS)).toBe(0);
    expect(musicStartTime(project, 99)).toBe(0);
    expect(musicStartTime(emptyTimeline("p"), 3)).toBe(0);
  });
});
