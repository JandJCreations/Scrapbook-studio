"use client";

import * as React from "react";

import { AudioPanel, type AudioValues } from "@/components/studio/audio-panel";
import { FadeSection } from "@/components/studio/fade-section";
import { PanelSlider } from "@/components/studio/panel-controls";
import { Button } from "@/components/ui/button";
import { TransitionSection } from "@/components/studio/transition-section";
import { MOTIONS, setAllMotion, setMotion } from "@/lib/timeline/motion";
import type { ClipMotion } from "@/types/timeline";
import { PhotoPanel, VideoPanel } from "@/components/studio/look-panels";
import { patchAudio, patchFades, patchPhotoAdjustments, patchVideoAdjustments, setAllStillDurations } from "@/lib/editor/ops";
import { setSpeed } from "@/lib/timeline/clip-edits";
import { clipDuration } from "@/lib/timeline/clip-math";
import {
  DEFAULT_TRANSITION_SECONDS,
  effectiveTransition,
  previousClip,
  setAllTransitions,
  setTransition,
} from "@/lib/timeline/transitions";
import { trimClip } from "@/lib/timeline/trim";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { DEFAULT_PHOTO_ADJUSTMENTS, type PhotoAdjustments } from "@/types/photo-adjustments";
import type { Clip, TimelineProject } from "@/types/timeline";
import { createDefaultVideoAdjustments, type VideoAdjustments } from "@/types/video-adjustments";

interface Pending {
  photo?: Partial<PhotoAdjustments>;
  video?: Partial<VideoAdjustments>;
  audio?: Partial<AudioValues>;
  fades?: { fadeIn?: number; fadeOut?: number };
  /** How long a photo is shown, in seconds. */
  duration?: number;
  /** How long the transition into the clip lasts, in seconds. */
  transitionDuration?: number;
}

function applyPending(project: TimelineProject, clip: Clip, pending: Pending): TimelineProject {
  let result = project;
  if (pending.photo) result = patchPhotoAdjustments(result, clip.id, pending.photo);
  if (pending.video) result = patchVideoAdjustments(result, clip.id, pending.video);
  if (pending.audio) result = patchAudio(result, clip.id, pending.audio);
  if (pending.fades) result = patchFades(result, clip.id, pending.fades);
  if (pending.duration !== undefined) result = trimClip(result, clip.id, "end", clip.start + pending.duration);
  if (pending.transitionDuration !== undefined) {
    result = setTransition(result, clip.id, {
      type: clip.transition?.type ?? "fade",
      duration: pending.transitionDuration,
    });
  }
  return result;
}

/** Only the look fields of a video, so a reset leaves its trim alone. */
function videoLookDefaults(clip: Clip): Partial<VideoAdjustments> {
  const base = createDefaultVideoAdjustments(clip.sourceDuration ?? 0);
  return { brightness: base.brightness, contrast: base.contrast, saturation: base.saturation, blur: base.blur };
}

/** The Details panel: how long, how it looks and how it sounds, for the selected photo, video or music clip. */
export function EditTab({ clip }: { clip: Clip | null }) {
  const clipId = clip?.id ?? null;
  // Only what the transition section needs, so a gesture elsewhere does not redraw the panel.
  const hasPrevious = useClipProjectStore((s) => (clip ? previousClip(selectProject(s), clip) !== null : false));
  const shownTransitionSeconds = useClipProjectStore((s) =>
    clip ? (effectiveTransition(selectProject(s), clip)?.duration ?? null) : null,
  );
  // Changes made while previewing. Each preview is recomputed from the project
  // as it was before the gesture, so the patches must be sent together.
  const pending = React.useRef<Pending>({});

  const commit = React.useCallback(() => {
    pending.current = {};
    useClipProjectStore.getState().endGesture();
  }, []);

  // Any other gesture that starts must not rebuild from before an edit that never lost focus.
  React.useEffect(() => {
    const closeOpenEdit = () => {
      if (Object.keys(pending.current).length > 0) commit();
    };
    window.addEventListener("pointerdown", closeOpenEdit, true);
    return () => window.removeEventListener("pointerdown", closeOpenEdit, true);
  }, [commit]);

  // Changing the selection closes a change that is still open.
  React.useEffect(() => commit, [clipId, commit]);

  if (!clip || (clip.kind !== "image" && clip.kind !== "video" && clip.kind !== "audio")) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        Select a photo, video or song on the timeline to change how it looks, how long it plays and how it sounds.
      </p>
    );
  }

  const preview = (patch: Pending) => {
    pending.current = {
      photo: patch.photo ? { ...pending.current.photo, ...patch.photo } : pending.current.photo,
      video: patch.video ? { ...pending.current.video, ...patch.video } : pending.current.video,
      audio: patch.audio ? { ...pending.current.audio, ...patch.audio } : pending.current.audio,
      fades: patch.fades ? { ...pending.current.fades, ...patch.fades } : pending.current.fades,
      duration: patch.duration ?? pending.current.duration,
      transitionDuration: patch.transitionDuration ?? pending.current.transitionDuration,
    };
    const merged = pending.current;
    useClipProjectStore.getState().previewApply((project) => applyPending(project, clip, merged));
  };
  const apply = (op: (project: TimelineProject) => TimelineProject) => {
    commit();
    useClipProjectStore.getState().apply(op);
  };

  const id = clip.id;
  const transitionSection = (
    <TransitionSection
      transition={
        clip.transition ? { ...clip.transition, duration: shownTransitionSeconds ?? clip.transition.duration } : null
      }
      hasPrevious={hasPrevious}
      onType={(type) =>
        apply((p) =>
          setTransition(p, id, type === null ? null : { type, duration: clip.transition?.duration ?? DEFAULT_TRANSITION_SECONDS }),
        )
      }
      onDurationPreview={(transitionDuration) => preview({ transitionDuration })}
      onCommit={commit}
      onApplyToAll={() =>
        apply((p) => {
          const own = p.clips.find((c) => c.id === id)?.transition;
          return own ? setAllTransitions(p, own) : p;
        })
      }
    />
  );
  const audioPanel = (
    <AudioPanel
      volume={clip.volume}
      muted={clip.muted}
      fadeIn={clip.fadeIn}
      fadeOut={clip.fadeOut}
      speed={clip.speed}
      maxFade={clipDuration(clip)}
      onPreview={(audio) => preview({ audio })}
      onCommit={commit}
      onApply={(audio) => apply((project) => patchAudio(project, id, audio))}
      onSpeed={(speed) => apply((project) => setSpeed(project, id, speed))}
    />
  );

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
      {clip.kind === "image" && (
        <>
          <PanelSlider
            label="Duration (seconds)"
            value={Math.round(clipDuration(clip) * 10) / 10}
            min={0.5}
            max={30}
            step={0.5}
            onChange={(duration) => preview({ duration })}
            onCommit={commit}
          />
          <Button
            size="xs"
            variant="outline"
            aria-label="Apply this length to all photos"
            onClick={() =>
              apply((p) => {
                const current = p.clips.find((c) => c.id === id);
                return current ? setAllStillDurations(p, clipDuration(current)) : p;
              })
            }
          >
            Apply this length to all photos
          </Button>
          {transitionSection}
          <div className="space-y-2 rounded-lg border border-border p-2.5">
            <h3 className="text-xs font-medium">Motion</h3>
            <select
              aria-label="Motion"
              value={clip.motion ?? "none"}
              onChange={(event) =>
                apply((p) => setMotion(p, id, event.target.value === "none" ? null : (event.target.value as ClipMotion)))
              }
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="none">None</option>
              {MOTIONS.map(({ motion, label }) => (
                <option key={motion} value={motion}>
                  {label}
                </option>
              ))}
            </select>
            {clip.motion && (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  apply((p) => {
                    const own = p.clips.find((c) => c.id === id)?.motion ?? null;
                    return setAllMotion(p, own);
                  })
                }
              >
                Apply motion to all photos
              </Button>
            )}
          </div>
          <PhotoPanel
            adjustments={clip.adjustments.photo ?? DEFAULT_PHOTO_ADJUSTMENTS}
            onPreview={(photo) => preview({ photo })}
            onCommit={commit}
            onApply={(photo) => apply((project) => patchPhotoAdjustments(project, id, photo))}
            onReset={() =>
              apply((project) =>
                patchPhotoAdjustments(project, id, { ...DEFAULT_PHOTO_ADJUSTMENTS, crop: clip.adjustments.photo?.crop ?? null }),
              )
            }
          />
          <FadeSection
            fadeIn={clip.fadeIn}
            fadeOut={clip.fadeOut}
            maxFade={clipDuration(clip)}
            onPreview={(fades) => preview({ fades })}
            onCommit={commit}
          />
        </>
      )}
      {clip.kind === "video" && (
        <>
          {transitionSection}
          <VideoPanel
            adjustments={clip.adjustments.video ?? createDefaultVideoAdjustments(clip.sourceDuration ?? 0)}
            onPreview={(video) => preview({ video })}
            onCommit={commit}
            onApply={(video) => apply((project) => patchVideoAdjustments(project, id, video))}
            onReset={() => apply((project) => patchVideoAdjustments(project, id, videoLookDefaults(clip)))}
          />
          {audioPanel}
        </>
      )}
      {clip.kind === "audio" && audioPanel}
    </div>
  );
}
