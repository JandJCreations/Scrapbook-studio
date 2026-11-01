"use client";

import * as React from "react";

import { AudioPanel, type AudioValues } from "@/components/studio/audio-panel";
import { PhotoPanel, VideoPanel } from "@/components/studio/look-panels";
import {
  patchAudio,
  patchPhotoAdjustments,
  patchVideoAdjustments,
  setClipOpacity,
} from "@/lib/editor/ops";
import { setSpeed } from "@/lib/timeline/clip-edits";
import { clipDuration } from "@/lib/timeline/clip-math";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { DEFAULT_PHOTO_ADJUSTMENTS, type PhotoAdjustments } from "@/types/photo-adjustments";
import type { Clip, TimelineProject } from "@/types/timeline";
import { createDefaultVideoAdjustments, type VideoAdjustments } from "@/types/video-adjustments";

interface Pending {
  photo?: Partial<PhotoAdjustments>;
  video?: Partial<VideoAdjustments>;
  audio?: Partial<AudioValues>;
  opacity?: number;
}

function applyPending(project: TimelineProject, id: string, pending: Pending): TimelineProject {
  let result = project;
  if (pending.photo) result = patchPhotoAdjustments(result, id, pending.photo);
  if (pending.video) result = patchVideoAdjustments(result, id, pending.video);
  if (pending.audio) result = patchAudio(result, id, pending.audio);
  if (pending.opacity !== undefined) result = setClipOpacity(result, id, pending.opacity);
  return result;
}

/** The sidebar's Edit tab: the look and sound controls for the selected picture, video or music clip. */
export function EditTab({ clip }: { clip: Clip | null }) {
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

  if (!clip || (clip.kind !== "image" && clip.kind !== "video" && clip.kind !== "audio")) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        Select a picture, video or music clip to edit how it looks and sounds.
      </p>
    );
  }
  const id = clip.id;

  const preview = (patch: Pending) => {
    pending.current = {
      photo: patch.photo ? { ...pending.current.photo, ...patch.photo } : pending.current.photo,
      video: patch.video ? { ...pending.current.video, ...patch.video } : pending.current.video,
      audio: patch.audio ? { ...pending.current.audio, ...patch.audio } : pending.current.audio,
      opacity: patch.opacity ?? pending.current.opacity,
    };
    const merged = pending.current;
    useClipProjectStore.getState().previewApply((project) => applyPending(project, id, merged));
  };
  const apply = (op: (project: TimelineProject) => TimelineProject) => {
    commit();
    useClipProjectStore.getState().apply(op);
  };

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
        <PhotoPanel
          adjustments={clip.adjustments.photo ?? DEFAULT_PHOTO_ADJUSTMENTS}
          opacity={clip.transform.opacity}
          onPreview={(photo) => preview({ photo })}
          onCommit={commit}
          onApply={(photo) => apply((project) => patchPhotoAdjustments(project, id, photo))}
          onOpacity={(opacity) => preview({ opacity })}
          onReset={() =>
            apply((project) =>
              setClipOpacity(patchPhotoAdjustments(project, id, DEFAULT_PHOTO_ADJUSTMENTS), id, 1),
            )
          }
        />
      )}
      {clip.kind === "video" && (
        <>
          <VideoPanel
            adjustments={clip.adjustments.video ?? createDefaultVideoAdjustments(clip.sourceDuration ?? 0)}
            opacity={clip.transform.opacity}
            onPreview={(video) => preview({ video })}
            onCommit={commit}
            onApply={(video) => apply((project) => patchVideoAdjustments(project, id, video))}
            onOpacity={(opacity) => preview({ opacity })}
            onReset={() =>
              apply((project) =>
                setClipOpacity(
                  patchVideoAdjustments(
                    project,
                    id,
                    createDefaultVideoAdjustments(clip.sourceDuration ?? 0),
                  ),
                  id,
                  1,
                ),
              )
            }
          />
          {audioPanel}
        </>
      )}
      {clip.kind === "audio" && audioPanel}
    </div>
  );
}
