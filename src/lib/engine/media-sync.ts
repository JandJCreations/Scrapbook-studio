import { assignSlots, type SlotState } from "@/lib/engine/slots";
import { planWanted, type MediaElementKind, type WantedMedia } from "@/lib/engine/wanted";
import type { TimelineProject } from "@/types/timeline";

/** While playing, only seek when the element is this far off, in timeline seconds. */
export const PLAYING_SEEK_THRESHOLD = 0.25;
/**
 * While paused or scrubbing, and when positioning a preload, seek on any real
 * difference (source seconds). It must be below one frame step, or stepping a
 * frame at 60 fps or in slow motion would not change the picture.
 */
export const PAUSED_SEEK_THRESHOLD = 0.001;
/** Reversed clips cannot play, so while playing they step with a seek this often (timeline seconds). */
export const REVERSE_STEP_SECONDS = 0.04;

/**
 * Whether an element at `currentTime` must be moved to `target`. While
 * playing, drift is measured in timeline seconds (source drift divided by
 * playback rate), so fast clips are not seeked in a loop and slow clips do not
 * drift out of sync.
 */
export function needsSeek(
  currentTime: number,
  wanted: Pick<WantedMedia, "active" | "reversed" | "playbackRate">,
  target: number,
  playing: boolean,
): boolean {
  const drift = Math.abs(currentTime - target);
  if (!playing || !wanted.active) return drift > PAUSED_SEEK_THRESHOLD;
  const timelineDrift = drift / wanted.playbackRate;
  return timelineDrift > (wanted.reversed ? REVERSE_STEP_SECONDS : PLAYING_SEEK_THRESHOLD);
}

/** What the glue must do to one media element. */
export interface SlotCommand {
  /** null = create a new element. */
  slotId: string | null;
  clipId: string;
  mediaId: string;
  kind: MediaElementKind;
  active: boolean;
  /** The element must be pointed at `mediaId` (new, or holding another file). */
  load: boolean;
  /** Seek to this source time, or null if already close enough. */
  seekTo: number | null;
  play: boolean;
  playbackRate: number;
  gain: number;
}

export interface MediaSyncPlan {
  commands: SlotCommand[];
  /** Elements nothing wants now; the glue may pause or recycle them. */
  releasedSlotIds: string[];
  /** Clips that could not get an element because of the video cap. */
  droppedClipIds: string[];
}

export function planMediaSync(
  project: TimelineProject,
  t: number,
  playing: boolean,
  slots: SlotState[],
): MediaSyncPlan {
  const wanted = planWanted(project, t, playing);
  const { assignments, releasedSlotIds, droppedClipIds } = assignSlots(wanted, slots);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const commands = assignments.map(({ wanted: item, slotId }): SlotCommand => {
    const slot = slotId === null ? undefined : slotById.get(slotId);
    const load = slot === undefined || slot.mediaId !== item.mediaId;
    const seek =
      load || (slot !== undefined && needsSeek(slot.currentTime, item, item.targetTime, playing));
    return {
      slotId,
      clipId: item.clipId,
      mediaId: item.mediaId,
      kind: item.kind,
      active: item.active,
      load,
      seekTo: seek ? item.targetTime : null,
      play: item.shouldPlay,
      playbackRate: item.playbackRate,
      gain: item.gain,
    };
  });

  return { commands, releasedSlotIds, droppedClipIds };
}
