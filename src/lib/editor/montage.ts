import { addAudioClip, addToSequence, fitMusicToVideo, patchFades, type AddResult, type EditorMedia } from "@/lib/editor/ops";
import { addText, TEXT_STYLES } from "@/lib/editor/text-ops";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { videoEnd } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import { setMotion } from "@/lib/timeline/motion";
import { trimClip } from "@/lib/timeline/trim";
import { DEFAULT_TRANSITION_SECONDS, setTransition } from "@/lib/timeline/transitions";
import type { ClipMotion, TimelineProject, TransitionType } from "@/types/timeline";

/** Each photo stays up this long in a montage. */
export const MONTAGE_PHOTO_SECONDS = 3;
/** How long the opening title stays up. */
export const MONTAGE_TITLE_SECONDS = 3;
/** Photos drift a different way each time, so a run of stills never feels static. */
const MOTION_CYCLE: ClipMotion[] = ["zoom-in", "pan-left", "zoom-out", "pan-right"];
/** Mostly soft fades, with a slide now and then for a lift. */
const TRANSITION_CYCLE: TransitionType[] = ["fade", "fade", "slide-left", "fade", "fade", "slide-right"];

export interface MontageOptions {
  /** Words for the opening title; empty for none. */
  title: string;
  /** A song to put underneath, cut to the video's length; null for none. */
  music: EditorMedia | null;
}

export interface MontageResult {
  project: TimelineProject;
  /** The clips made for the pictures, in order. */
  clipIds: string[];
}

/**
 * Turns a set of photos and videos into a finished-looking video in one go:
 * they go on the end of the strip in order, photos get an even length and a
 * gentle movement, every cut gets a transition, a title opens it and a song
 * plays underneath, faded in and out.
 */
export function buildMontage(
  project: TimelineProject,
  media: EditorMedia[],
  frame: FrameSize,
  options: MontageOptions,
  newId: IdFn = createId,
): MontageResult {
  let result = project;
  const clipIds: string[] = [];
  const pictures = media.filter((m) => m.kind === "image" || m.kind === "video");
  // Where the new pictures begin: after anything already on the strip.
  const firstStart = videoEnd(project);
  let photos = 0;

  pictures.forEach((item, index) => {
    const added: AddResult = addToSequence(result, item, frame, newId);
    result = added.project;
    const clip = result.clips.find((c) => c.id === added.clipId);
    if (!clip) return;
    clipIds.push(clip.id);
    if (item.kind === "image") {
      result = trimClip(result, clip.id, "end", clip.start + MONTAGE_PHOTO_SECONDS);
      result = setMotion(result, clip.id, MOTION_CYCLE[photos % MOTION_CYCLE.length]);
      photos += 1;
    }
    // The first picture of a fresh video just starts; every later one comes in with a transition.
    if (index > 0 || firstStart > 0) {
      result = setTransition(result, clip.id, {
        type: TRANSITION_CYCLE[index % TRANSITION_CYCLE.length],
        duration: DEFAULT_TRANSITION_SECONDS,
      });
    }
  });

  const title = options.title.trim();
  if (title !== "" && clipIds.length > 0) {
    const style = TEXT_STYLES.find((s) => s.id === "title");
    const titled = addText(result, frame, firstStart, {
      content: title,
      style,
      span: { start: firstStart, duration: MONTAGE_TITLE_SECONDS },
    }, newId);
    result = patchFades(titled.project, titled.clipId, { fadeIn: 0.4, fadeOut: 0.6 });
  }

  if (options.music && clipIds.length > 0) {
    const song = addAudioClip(result, options.music, frame, firstStart, newId);
    result = fitMusicToVideo(song.project, song.clipId);
    result = patchFades(result, song.clipId, { fadeIn: 0.5, fadeOut: 1.5 });
  }

  return { project: result, clipIds };
}
