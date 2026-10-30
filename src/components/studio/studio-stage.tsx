"use client";

import * as React from "react";

import { StageInteraction } from "@/components/studio/stage-interaction";
import { useElementSize } from "@/hooks/use-element-size";
import { stageBoxes } from "@/lib/editor/stage";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

interface StudioStageProps {
  /** Receives the painter's container; owned by useStudioPlayback. */
  containerRef: React.RefCallback<HTMLDivElement>;
  frame: FrameSize | null;
}

export function StudioStage({ containerRef, frame }: StudioStageProps) {
  const { ref: sizeRef, size } = useElementSize<HTMLDivElement>();
  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);
  const boxes = React.useMemo(() => stageBoxes(project, time), [project, time]);

  return (
    <div
      ref={sizeRef}
      data-testid="studio-stage"
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30"
    >
      <div ref={containerRef} className="absolute inset-0" />
      {frame && size.width > 0 && size.height > 0 && (
        <div className="absolute inset-0 z-10">
          <StageInteraction
            width={size.width}
            height={size.height}
            frame={frame}
            boxes={boxes}
            selectedIds={selectedIds}
          />
        </div>
      )}
    </div>
  );
}
