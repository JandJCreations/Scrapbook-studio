"use client";

import * as React from "react";

import { AudioPanel, type AudioValues } from "@/components/studio/audio-panel";
import { CropSection } from "@/components/studio/crop-section";
import { KeyframesSection } from "@/components/studio/keyframes-section";
import { PhotoPanel, VideoPanel } from "@/components/studio/look-panels";
import {
  CROP_ASPECTS,
  controlsFromCrop,
  cropFor,
  type CropControls,
} from "@/lib/appearance/crop";
import {
  clearKeyframes,
  removeKeyframe,
  setOpacityAt,
  upsertKeyframe,
} from "@/lib/editor/keyframes";
import {
  patchAudio,
  patchPhotoAdjustments,
  patchVideoAdjustments,
  setClipOpacity,
  setCrop,
} from "@/lib/editor/ops";
import { clipBaseState } from "@/lib/playback/draw-state";
import { setSpeed } from "@/lib/timeline/clip-edits";
import { clipDuration } from "@/lib/timeline/clip-math";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  type CropRect,
  type PhotoAdjustments,
} from "@/types/photo-adjustments";
import type { Clip, TimelineProject } from "@/types/timeline";
import {
  createDefaultVideoAdjustments,
  type VideoAdjustments,
} from "@/types/video-adjustments";

interface Pending {
  photo?: Partial<PhotoAdjustments>;
  video?: Partial<VideoAdjustments>;
  audio?: Partial<AudioValues>;
  opacity?: number;
  /** Where in the clip (seconds from its start) an opacity change on an animated clip is keyed. */
  opacityTime?: number;
  crop?: { value: CropRect | null };
}

type Size = { width: number; height: number };

function applyPending(
  project: TimelineProject,
  id: string,
  pending: Pending,
  natural: Size | null,
): TimelineProject {
  let result = project;
  if (pending.photo) result = patchPhotoAdjustments(result, id, pending.photo);
  if (pending.video) result = patchVideoAdjustments(result, id, pending.video);
  if (pending.audio) result = patchAudio(result, id, pending.audio);
  if (pending.opacity !== undefined) {
    result = setOpacityAt(
      result,
      id,
      pending.opacityTime ?? 0,
      pending.opacity,
    );
  }
  if (pending.crop && natural)
    result = setCrop(result, id, pending.crop.value, natural);
  return result;
}

/** Only the look fields of a video, so a reset leaves its crop and trim alone. */
function videoLookDefaults(clip: Clip): Partial<VideoAdjustments> {
  const base = createDefaultVideoAdjustments(clip.sourceDuration ?? 0);
  return {
    opacity: base.opacity,
    brightness: base.brightness,
    contrast: base.contrast,
    saturation: base.saturation,
    blur: base.blur,
    shadow: base.shadow,
  };
}

/** The sidebar's Edit tab: the look and sound controls for the selected picture, video or music clip. */
export function EditTab({
  clip,
  natural,
  onSeek,
}: {
  clip: Clip | null;
  /** The picture or video file's own size, once known; the crop needs it. */
  natural: Size | null;
  onSeek(time: number): void;
}) {
  const clipId = clip?.id ?? null;
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

  if (
    !clip ||
    (clip.kind !== "image" && clip.kind !== "video" && clip.kind !== "audio")
  ) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        Select a picture, video or music clip to edit how it looks and sounds.
      </p>
    );
  }
  const id = clip.id;
  // An animated clip's opacity is whatever its keyframes give at the playhead; the
  // slider shows (and steps from) that, not the unused static value.
  const shownOpacity =
    clip.keyframes.length > 0
      ? clipBaseState(clip, useTransportStore.getState().time - clip.start).opacity
      : clip.transform.opacity;

  const preview = (patch: Pending) => {
    pending.current = {
      photo: patch.photo
        ? { ...pending.current.photo, ...patch.photo }
        : pending.current.photo,
      video: patch.video
        ? { ...pending.current.video, ...patch.video }
        : pending.current.video,
      audio: patch.audio
        ? { ...pending.current.audio, ...patch.audio }
        : pending.current.audio,
      opacity: patch.opacity ?? pending.current.opacity,
      opacityTime:
        pending.current.opacityTime ??
        (patch.opacity !== undefined
          ? useTransportStore.getState().time - clip.start
          : undefined),
      crop: patch.crop ?? pending.current.crop,
    };
    const merged = pending.current;
    useClipProjectStore
      .getState()
      .previewApply((project) => applyPending(project, id, merged, natural));
  };
  const apply = (op: (project: TimelineProject) => TimelineProject) => {
    commit();
    useClipProjectStore.getState().apply(op);
  };

  // The crop controls: shape, zoom and position, turned into a crop of the file's own pixels.
  const currentCrop =
    clip.kind === "image"
      ? (clip.adjustments.photo?.crop ?? null)
      : (clip.adjustments.video?.crop ?? null);
  const cropControls: CropControls = natural
    ? controlsFromCrop(natural, currentCrop)
    : { aspect: "original", zoom: 1, panX: 50, panY: 50 };
  const cropFrom = (controls: CropControls): CropRect | null => {
    if (!natural) return null;
    const preset = CROP_ASPECTS.find((a) => a.id === controls.aspect);
    const ratio = preset
      ? preset.ratio
      : currentCrop
        ? currentCrop.width / currentCrop.height
        : null;
    // The original shape at 1x is no crop at all.
    if (controls.aspect === "original" && controls.zoom <= 1) return null;
    return cropFor(natural, ratio, controls.zoom, controls.panX, controls.panY);
  };
  const cropSection = (clip.kind === "image" || clip.kind === "video") && (
    <CropSection
      controls={cropControls}
      ready={natural !== null}
      onPreview={(controls) => preview({ crop: { value: cropFrom(controls) } })}
      onCommit={commit}
      onApply={(controls) => {
        if (natural)
          apply((project) => setCrop(project, id, cropFrom(controls), natural));
      }}
    />
  );
  const localTime = () => useTransportStore.getState().time - clip.start;
  const keyframesSection = (clip.kind === "image" || clip.kind === "video") && (
    <KeyframesSection
      clip={clip}
      playhead={useTransportStore.getState().time}
      onSeek={onSeek}
      onAdd={() =>
        apply((project) => upsertKeyframe(project, id, localTime(), {}))
      }
      onRemove={(keyframeId) =>
        apply((project) => removeKeyframe(project, id, keyframeId))
      }
      onClear={() =>
        apply((project) => clearKeyframes(project, id, localTime()))
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
          <PhotoPanel
            adjustments={clip.adjustments.photo ?? DEFAULT_PHOTO_ADJUSTMENTS}
            opacity={shownOpacity}
            onPreview={(photo) => preview({ photo })}
            onCommit={commit}
            onApply={(photo) =>
              apply((project) => patchPhotoAdjustments(project, id, photo))
            }
            onOpacity={(opacity) => preview({ opacity })}
            onReset={() =>
              // The look goes back to normal; the crop is not part of the look and stays.
              apply((project) =>
                setClipOpacity(
                  patchPhotoAdjustments(project, id, {
                    ...DEFAULT_PHOTO_ADJUSTMENTS,
                    crop: clip.adjustments.photo?.crop ?? null,
                  }),
                  id,
                  1,
                ),
              )
            }
          />
          {cropSection}
          {keyframesSection}
        </>
      )}
      {clip.kind === "video" && (
        <>
          <VideoPanel
            adjustments={
              clip.adjustments.video ??
              createDefaultVideoAdjustments(clip.sourceDuration ?? 0)
            }
            opacity={shownOpacity}
            onPreview={(video) => preview({ video })}
            onCommit={commit}
            onApply={(video) =>
              apply((project) => patchVideoAdjustments(project, id, video))
            }
            onOpacity={(opacity) => preview({ opacity })}
            onReset={() =>
              apply((project) =>
                setClipOpacity(
                  patchVideoAdjustments(project, id, videoLookDefaults(clip)),
                  id,
                  1,
                ),
              )
            }
          />
          {cropSection}
          {keyframesSection}
          {audioPanel}
        </>
      )}
      {clip.kind === "audio" && audioPanel}
    </div>
  );
}
