"use client";

import * as React from "react";

interface StudioPreviewProps {
  /** Receives the painter's container; owned by useStudioPlayback. */
  containerRef: React.RefCallback<HTMLDivElement>;
  /** The whole preview, for going full screen. */
  wrapperRef?: React.Ref<HTMLDivElement>;
}

/** The video as it will be exported: nothing on it can be dragged, resized or selected. */
export function StudioPreview({ containerRef, wrapperRef }: StudioPreviewProps) {
  return (
    <div
      ref={wrapperRef}
      data-testid="studio-preview"
      data-tour="stage"
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30"
    >
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
