"use client";

import * as React from "react";
import { Type } from "lucide-react";

import { FadeSection } from "@/components/studio/fade-section";
import { KeyframesSection } from "@/components/studio/keyframes-section";
import { TextPanel } from "@/components/studio/text-panel";
import { Button } from "@/components/ui/button";
import {
  clearKeyframes,
  removeKeyframe,
  upsertKeyframe,
} from "@/lib/editor/keyframes";
import {
  addText,
  patchFades,
  patchTextAdjustments,
  resetTextAdjustments,
  type AddResult,
} from "@/lib/editor/ops";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { clipDuration } from "@/lib/timeline/clip-math";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { Clip, TimelineProject } from "@/types/timeline";
import type { TextAdjustments } from "@/types/text-adjustments";

interface TextTabProps {
  frame: FrameSize | null;
  /** The single selected clip when it is a text clip. */
  selectedText: Clip | null;
  onSeek(time: number): void;
}

export function TextTab({ frame, selectedText, onSeek }: TextTabProps) {
  const textId = selectedText?.id ?? null;
  // Changes made while previewing; each preview is recomputed from the project
  // as it was before the gesture, so the patches must be sent together.
  const pending = React.useRef<Partial<TextAdjustments>>({});
  const fadePending = React.useRef<{ fadeIn?: number; fadeOut?: number }>({});

  const commit = React.useCallback(() => {
    pending.current = {};
    fadePending.current = {};
    useClipProjectStore.getState().endGesture();
  }, []);

  // Any other gesture that starts (a timeline drag, a touch on the stage) must
  // not rebuild from before a panel edit that never lost focus, so an open
  // panel edit is closed the moment any pointer goes down.
  React.useEffect(() => {
    const closeOpenEdit = () => {
      if (Object.keys(pending.current).length > 0 || Object.keys(fadePending.current).length > 0) commit();
    };
    window.addEventListener("pointerdown", closeOpenEdit, true);
    return () => window.removeEventListener("pointerdown", closeOpenEdit, true);
  }, [commit]);

  // Changing the selection closes a change that is still open.
  React.useEffect(() => commit, [textId, commit]);

  function addNewText() {
    if (!frame) return;
    const at = useTransportStore.getState().time;
    let result: AddResult | null = null;
    useClipProjectStore.getState().apply((project) => {
      result = addText(project, frame, at);
      return result.project;
    });
    const added = result as AddResult | null;
    if (added)
      useClipProjectStore.getState().setSelectedClipIds([added.clipId]);
  }

  const adjustments = selectedText?.adjustments.text ?? null;
  const apply = (op: (project: TimelineProject) => TimelineProject) => {
    commit();
    useClipProjectStore.getState().apply(op);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <Button
          className="w-full gap-2"
          variant="secondary"
          disabled={!frame}
          onClick={addNewText}
        >
          <Type className="size-4" />
          Add text
        </Button>
      </div>

      {textId && adjustments && frame ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <TextPanel
            adjustments={adjustments}
            onPreview={(patch) => {
              pending.current = { ...pending.current, ...patch };
              const merged = pending.current;
              useClipProjectStore
                .getState()
                .previewApply((project) =>
                  patchTextAdjustments(project, textId, merged),
                );
            }}
            onCommit={commit}
            onApply={(patch) => {
              commit();
              useClipProjectStore
                .getState()
                .apply((project) =>
                  patchTextAdjustments(project, textId, patch),
                );
            }}
            onReset={() => {
              commit();
              useClipProjectStore
                .getState()
                .apply((project) =>
                  resetTextAdjustments(project, textId, frame),
                );
            }}
          />
          {selectedText && (
            <div className="px-3 pb-3">
              <FadeSection
              fadeIn={selectedText.fadeIn}
              fadeOut={selectedText.fadeOut}
              maxFade={clipDuration(selectedText)}
              onPreview={(fades) => {
                fadePending.current = { ...fadePending.current, ...fades };
                const merged = fadePending.current;
                useClipProjectStore.getState().previewApply((project) => patchFades(project, textId, merged));
              }}
              onCommit={commit}
            />
            <KeyframesSection
                clip={selectedText}
                playhead={useTransportStore.getState().time}
                onSeek={onSeek}
                onAdd={() =>
                  apply((project) =>
                    upsertKeyframe(
                      project,
                      textId,
                      useTransportStore.getState().time - selectedText.start,
                      {},
                    ),
                  )
                }
                onRemove={(keyframeId) =>
                  apply((project) =>
                    removeKeyframe(project, textId, keyframeId),
                  )
                }
                onClear={() =>
                  apply((project) =>
                    clearKeyframes(
                      project,
                      textId,
                      useTransportStore.getState().time - selectedText.start,
                    ),
                  )
                }
              />
            </div>
          )}
        </div>
      ) : (
        <p className="px-3 text-sm text-muted-foreground">
          Add text, or select a text clip on the stage or timeline to edit it.
        </p>
      )}
    </div>
  );
}
