"use client";

import * as React from "react";
import { Copy, Scissors, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteSelected, duplicateSelected, splitAtPlayhead } from "@/lib/timeline-ui/commands";
import { blurOnMouseClick } from "@/lib/dom/blur-on-mouse-click";
import { clipDuration, clipEnd, MIN_CLIP_DURATION } from "@/lib/timeline/clip-math";
import { createId } from "@/lib/timeline/ids";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

/** Split, duplicate and delete for the selected clip, above the timeline (like CapCut's tool row). */
export function ClipTools() {
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const project = useClipProjectStore(selectProject);
  const time = useTransportStore((s) => s.time);

  const selected = project.clips.filter((clip) => selectedIds.includes(clip.id));
  const hasSelection = selected.length > 0;
  // Splitting needs the playhead inside a clip: the selected one, or any clip when nothing is selected.
  // ...and at least a sliver's width from either edge, or the split does nothing.
  const canSplit = (hasSelection ? selected : project.clips).some(
    (clip) =>
      time - clip.start >= MIN_CLIP_DURATION - 1e-9 &&
      clipEnd(clip) - time >= MIN_CLIP_DURATION - 1e-9 &&
      clipDuration(clip) >= 2 * MIN_CLIP_DURATION,
  );

  function split() {
    useClipProjectStore.getState().apply((p) => splitAtPlayhead(p, selectedIds, useTransportStore.getState().time));
  }

  function duplicate() {
    const made: string[] = [];
    const newId = () => {
      const id = createId();
      made.push(id);
      return id;
    };
    useClipProjectStore.getState().apply((p) => duplicateSelected(p, selectedIds, newId));
    const existing = new Set(selectProject(useClipProjectStore.getState()).clips.map((c) => c.id));
    const copies = made.filter((id) => existing.has(id));
    if (copies.length > 0) useClipProjectStore.getState().setSelectedClipIds(copies);
  }

  function remove() {
    // The main strip closes the gap by itself; clips on other tracks stay where they are.
    useClipProjectStore.getState().apply((p) => deleteSelected(p, selectedIds, false));
    useClipProjectStore.getState().setSelectedClipIds([]);
  }

  return (
    <div
      role="toolbar"
      aria-label="Clip tools"
      className="flex items-center gap-1 border-t px-2 py-1"
      onClickCapture={blurOnMouseClick}
    >
      <Button variant="ghost" size="sm" aria-label="Split" disabled={!canSplit} onClick={split}>
        <Scissors className="size-4" />
        <span className="hidden sm:inline">Split</span>
      </Button>
      <Button variant="ghost" size="sm" aria-label="Duplicate" disabled={!hasSelection} onClick={duplicate}>
        <Copy className="size-4" />
        <span className="hidden sm:inline">Duplicate</span>
      </Button>
      <Button variant="ghost" size="sm" aria-label="Delete" disabled={!hasSelection} onClick={remove}>
        <Trash2 className="size-4" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </div>
  );
}
