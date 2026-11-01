"use client";

import * as React from "react";
import { Copy, Lock, Trash2, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteSelected, duplicateSelected } from "@/lib/timeline-ui/commands";
import { updateClip } from "@/lib/timeline/clip-edits";
import { createId } from "@/lib/timeline/ids";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";

/** Duplicate, lock and delete for whatever is selected, floating over the stage. */
export function SelectionToolbar() {
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const project = useClipProjectStore(selectProject);

  const selected = project.clips.filter((clip) => selectedIds.includes(clip.id));
  if (selected.length === 0) return null;
  const ids = selected.map((clip) => clip.id);
  const allLocked = selected.every((clip) => clip.locked);

  function duplicate() {
    const made: string[] = [];
    const newId = () => {
      const id = createId();
      made.push(id);
      return id;
    };
    useClipProjectStore.getState().apply((p) => duplicateSelected(p, ids, newId));
    // Locked clips are not copied, so only ids that really exist are selected.
    const existing = new Set(selectProject(useClipProjectStore.getState()).clips.map((c) => c.id));
    const copies = made.filter((id) => existing.has(id));
    if (copies.length > 0) useClipProjectStore.getState().setSelectedClipIds(copies);
  }

  function toggleLock() {
    useClipProjectStore
      .getState()
      .apply((p) => ids.reduce((current, id) => updateClip(current, id, { locked: !allLocked }), p));
  }

  function remove() {
    useClipProjectStore.getState().apply((p) => deleteSelected(p, ids, false));
    const existing = new Set(selectProject(useClipProjectStore.getState()).clips.map((c) => c.id));
    useClipProjectStore.getState().setSelectedClipIds(ids.filter((id) => existing.has(id)));
  }

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg"
    >
      <Button variant="ghost" size="icon" className="size-8" aria-label="Duplicate" onClick={duplicate}>
        <Copy className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={allLocked ? "Unlock" : "Lock"}
        onClick={toggleLock}
      >
        {allLocked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Delete" onClick={remove}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
