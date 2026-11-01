"use client";

import * as React from "react";
import { Type } from "lucide-react";

import { TextPanel } from "@/components/studio/text-panel";
import { Button } from "@/components/ui/button";
import {
  addText,
  patchTextAdjustments,
  resetTextAdjustments,
  type AddResult,
} from "@/lib/editor/ops";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { Clip } from "@/types/timeline";
import type { TextAdjustments } from "@/types/text-adjustments";

interface TextTabProps {
  frame: FrameSize | null;
  /** The single selected clip when it is a text clip. */
  selectedText: Clip | null;
}

export function TextTab({ frame, selectedText }: TextTabProps) {
  const textId = selectedText?.id ?? null;
  // Changes made while previewing; each preview is recomputed from the project
  // as it was before the gesture, so the patches must be sent together.
  const pending = React.useRef<Partial<TextAdjustments>>({});

  const commit = React.useCallback(() => {
    pending.current = {};
    useClipProjectStore.getState().endGesture();
  }, []);

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
    if (added) useClipProjectStore.getState().setSelectedClipIds([added.clipId]);
  }

  const adjustments = selectedText?.adjustments.text ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <Button className="w-full gap-2" variant="secondary" disabled={!frame} onClick={addNewText}>
          <Type className="size-4" />
          Add text
        </Button>
      </div>

      {textId && adjustments && frame ? (
        <TextPanel
          adjustments={adjustments}
          onPreview={(patch) => {
            pending.current = { ...pending.current, ...patch };
            const merged = pending.current;
            useClipProjectStore
              .getState()
              .previewApply((project) => patchTextAdjustments(project, textId, merged));
          }}
          onCommit={commit}
          onApply={(patch) => {
            commit();
            useClipProjectStore.getState().apply((project) => patchTextAdjustments(project, textId, patch));
          }}
          onReset={() => {
            commit();
            useClipProjectStore.getState().apply((project) => resetTextAdjustments(project, textId, frame));
          }}
        />
      ) : (
        <p className="px-3 text-sm text-muted-foreground">
          Add text, or select a text clip on the stage or timeline to edit it.
        </p>
      )}
    </div>
  );
}
