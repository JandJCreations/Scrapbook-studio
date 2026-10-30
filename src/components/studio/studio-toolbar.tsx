"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FRAME_PRESETS } from "@/lib/export/frame-presets";
import type { SyncStatus } from "@/lib/sync/timeline-sync";

interface StudioToolbarProps {
  projectName: string;
  backHref: string;
  status: SyncStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  frame: { width: number; height: number } | null;
  onFrameChange(preset: { width: number; height: number }): void;
}

function statusText(status: SyncStatus): string {
  switch (status.phase) {
    case "loading":
      return "Loading…";
    case "ready":
      return "Saved";
    case "error":
      return status.error ? `Couldn't save: ${status.error}` : "Couldn't save";
    case "conflict":
      return "Changed elsewhere";
  }
}

export function StudioToolbar({
  projectName,
  backHref,
  status,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  frame,
  onFrameChange,
}: StudioToolbarProps) {
  const current = frame
    ? (FRAME_PRESETS.find((p) => p.width === frame.width && p.height === frame.height)?.id ??
      "custom")
    : "landscape";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Link
        href={backHref}
        aria-label="Back to dashboard"
        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <h1 className="min-w-0 truncate text-sm font-medium">{projectName}</h1>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="size-4" />
        </Button>

        <select
          aria-label="Frame size"
          className="rounded border bg-background px-1 py-1 text-xs text-foreground"
          value={current}
          onChange={(event) => {
            const preset = FRAME_PRESETS.find((p) => p.id === event.target.value);
            if (preset) onFrameChange({ width: preset.width, height: preset.height });
          }}
        >
          {FRAME_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          {current === "custom" && <option value="custom">Custom</option>}
        </select>

        <span className="w-40 truncate text-right text-xs text-muted-foreground" role="status">
          {statusText(status)}
        </span>
      </div>
    </header>
  );
}
