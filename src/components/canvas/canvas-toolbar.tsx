"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Download, History, Magnet, Minus, PanelLeft, Plus, Type } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { zoomAtPoint } from "@/lib/canvas/zoom";
import { FRAME_PRESETS } from "@/lib/export/frame-presets";
import { saveProjectFrame } from "@/lib/sync/project-content-sync";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useCanvasFrame, useCanvasFrameStore } from "@/store/use-canvas-frame-store";
import { useEditorUiStore } from "@/store/use-editor-ui-store";
import { useSettingsStore } from "@/store/use-settings-store";
import { useTextEditingStore } from "@/store/use-text-editing-store";

const ExportDialog = dynamic(() =>
  import("@/components/canvas/export-dialog").then((m) => m.ExportDialog),
);
const VersionHistoryDialog = dynamic(() =>
  import("@/components/canvas/version-history-dialog").then((m) => m.VersionHistoryDialog),
);

interface CanvasToolbarProps {
  projectId: string;
  projectName: string;
  stageWidth: number;
  stageHeight: number;
}

export function CanvasToolbar({
  projectId,
  projectName,
  stageWidth,
  stageHeight,
}: CanvasToolbarProps) {
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const snapToGrid = useCanvasStore((s) => s.snapToGrid);
  const toggleSnapToGrid = useCanvasStore((s) => s.toggleSnapToGrid);
  const addObject = useCanvasStore((s) => s.addObject);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const startEditing = useTextEditingStore((s) => s.startEditing);

  const frame = useCanvasFrame(projectId);
  const setFrame = useCanvasFrameStore((s) => s.setFrame);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const setSidebarOpen = useEditorUiStore((s) => s.setSidebarOpen);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const activePresetId =
    FRAME_PRESETS.find((p) => p.width === frame.width && p.height === frame.height)?.id ??
    FRAME_PRESETS[0].id;

  const center = { x: stageWidth / 2, y: stageHeight / 2 };

  function zoomBy(factor: number) {
    setViewport(zoomAtPoint(viewport, center, factor));
  }

  function resetZoom() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  function addText() {
    const worldCenterX = (-viewport.x + stageWidth / 2) / viewport.scale;
    const worldCenterY = (-viewport.y + stageHeight / 2) / viewport.scale;
    const width = 260;
    const height = 80;
    const newId = addObject(projectId, {
      type: "text",
      name: "Text",
      x: worldCenterX - width / 2,
      y: worldCenterY - height / 2,
      width,
      height,
    });
    setSelectedIds([newId]);
    startEditing(newId);
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background px-3 sm:gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to dashboard</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6 shrink-0" />

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 lg:hidden"
        aria-label="Open panels"
        onClick={() => setSidebarOpen(true)}
      >
        <PanelLeft className="size-4" />
      </Button>

      <Logo className="hidden sm:flex" />

      <span className="min-w-0 shrink truncate text-sm font-medium">
        {projectName}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-2"
            onClick={addText}
          >
            <Type className="size-4" />
            <span className="hidden md:inline">Add text</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add a text box to the canvas</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Select
          value={activePresetId}
          onValueChange={(id) => {
            const preset = FRAME_PRESETS.find((p) => p.id === id);
            if (!preset) return;
            const frame = { width: preset.width, height: preset.height };
            setFrame(projectId, frame);
            saveProjectFrame(projectId, frame).catch((error) => {
              console.error("Failed to save canvas frame:", error);
            });
          }}
        >
          <SelectTrigger
            className="hidden h-8 w-40 text-xs sm:flex"
            aria-label="Canvas size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRAME_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={snapToGrid ? "secondary" : "ghost"}
              size="icon"
              onClick={toggleSnapToGrid}
              aria-pressed={snapToGrid}
              aria-label="Toggle snap to grid"
              className={cn("hidden sm:inline-flex", snapToGrid && "text-primary")}
            >
              <Magnet className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {snapToGrid ? "Snap to grid: on" : "Snap to grid: off"}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => zoomBy(1 / 1.2)}
              aria-label="Zoom out"
            >
              <Minus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>

        <button
          type="button"
          onClick={resetZoom}
          className="hidden w-14 rounded-md py-1 text-center text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:block"
        >
          {Math.round(viewport.scale * 100)}%
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => zoomBy(1.2)}
              aria-label="Zoom in"
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setVersionsOpen(true)}
              aria-label="Version history"
            >
              <History className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Version history</TooltipContent>
        </Tooltip>

        <Button size="sm" className="gap-2" onClick={() => setExportOpen(true)}>
          <Download className="size-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>

      {exportOpen && (
        <ExportDialog projectId={projectId} open={exportOpen} onOpenChange={setExportOpen} />
      )}
      {versionsOpen && (
        <VersionHistoryDialog
          projectId={projectId}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
        />
      )}
    </header>
  );
}
