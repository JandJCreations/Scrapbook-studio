"use client";

import { Grid3x3, Maximize, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEFAULT_VIEW, type ViewGeometry, zoomTo } from "@/lib/editor/view";
import { useStageViewStore } from "@/store/use-stage-view-store";

const STEP = 1.25;

/** Zoom out, the zoom percentage, zoom in, and back to fit, in the stage's corner. */
export function StageViewControls({ geometry }: { geometry: ViewGeometry }) {
  const view = useStageViewStore((s) => s.view);
  const setView = useStageViewStore((s) => s.setView);
  const snapToGrid = useStageViewStore((s) => s.snapToGrid);
  const setSnapToGrid = useStageViewStore((s) => s.setSnapToGrid);
  const atFit = view.zoom === 1 && view.panX === 0 && view.panY === 0;

  return (
    <div
      className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-lg"
      // The stage's own drag handling must not see clicks on the controls.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        variant={snapToGrid ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Snap to grid"
        aria-pressed={snapToGrid}
        onClick={() => setSnapToGrid(!snapToGrid)}
      >
        <Grid3x3 className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => setView(zoomTo(geometry, view, view.zoom / STEP))}>
        <Minus className="size-4" />
      </Button>
      <span className="w-11 text-center text-xs tabular-nums" aria-live="polite">
        {Math.round(view.zoom * 100)}%
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => setView(zoomTo(geometry, view, view.zoom * STEP))}>
        <Plus className="size-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Fit to screen" disabled={atFit} onClick={() => setView(DEFAULT_VIEW)}>
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}
