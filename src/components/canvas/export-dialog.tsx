"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { downloadDataUrl, exportJpg, exportPdf, exportPng } from "@/lib/export/static-export";
import { RESOLUTION_PRESETS, resolveTargetSize } from "@/lib/export/export-resolutions";
import { exportAnimated, type AnimatedFormat } from "@/lib/export/video-export";
import {
  ANIMATED_FORMATS,
  FORMAT_GROUPS,
  TRANSPARENCY_SUPPORTED_FORMATS,
  type ExportFormat,
} from "@/lib/export/export-formats";
import { mixdownAudio } from "@/lib/export/audio-mixdown";
import { getRegisteredStage } from "@/lib/canvas/stage-registry";
import { useAudioClips, useAudioTracks } from "@/store/use-audio-store";
import { useCanvasFrame } from "@/store/use-canvas-frame-store";
import { useCanvasObjects } from "@/store/use-canvas-store";
import { useSettingsStore } from "@/store/use-settings-store";
import { useTimelineStore } from "@/store/use-timeline-store";

interface ExportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({ projectId, open, onOpenChange }: ExportDialogProps) {
  const frame = useCanvasFrame(projectId);
  const objects = useCanvasObjects(projectId);
  const audioClips = useAudioClips(projectId);
  const audioTracks = useAudioTracks(projectId);
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime);
  const defaultExportFormat = useSettingsStore((s) => s.defaultExportFormat);
  const defaultResolutionId = useSettingsStore((s) => s.defaultResolutionId);

  const [format, setFormat] = React.useState<ExportFormat>(defaultExportFormat);
  const [resolutionId, setResolutionId] = React.useState(defaultResolutionId);
  const [transparent, setTransparent] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [progressLabel, setProgressLabel] = React.useState("");
  const [progress, setProgress] = React.useState(0);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormat(defaultExportFormat);
      setResolutionId(defaultResolutionId);
    }
  }

  const isAnimated = ANIMATED_FORMATS.includes(format);
  const supportsTransparency = TRANSPARENCY_SUPPORTED_FORMATS.includes(format);
  const resolution =
    RESOLUTION_PRESETS.find((r) => r.id === resolutionId) ?? RESOLUTION_PRESETS[1];
  const targetSize = resolveTargetSize(frame, resolution);

  const timelineEnd = Math.max(
    5,
    ...objects.map((o) => o.endTime),
    ...audioClips.map((c) => c.startTime + (c.trimEnd - c.trimStart)),
  );

  async function handleExport() {
    const stage = getRegisteredStage();
    if (!stage) {
      toast.error("Canvas isn't ready yet");
      return;
    }

    setIsExporting(true);
    setProgress(0);
    const originalPlayhead = useTimelineStore.getState().playheadTime;

    try {
      const filenameBase = `scrapbook-export-${Date.now()}`;

      if (format === "png") {
        setProgressLabel("Rendering image...");
        exportPng(stage, frame.width, frame.height, targetSize.width, `${filenameBase}.png`);
      } else if (format === "jpg") {
        setProgressLabel("Rendering image...");
        exportJpg(stage, frame.width, frame.height, targetSize.width, `${filenameBase}.jpg`);
      } else if (format === "pdf") {
        setProgressLabel("Rendering PDF...");
        exportPdf(
          stage,
          frame.width,
          frame.height,
          targetSize.width,
          targetSize.height,
          `${filenameBase}.pdf`,
        );
      } else {
        setProgressLabel("Mixing audio...");
        const audioBlob = await mixdownAudio(audioClips, audioTracks, timelineEnd);

        const blob = await exportAnimated(stage, setPlayheadTime, {
          format: format as AnimatedFormat,
          frame,
          targetWidth: targetSize.width,
          fps: 24,
          durationSeconds: timelineEnd,
          transparent: transparent && supportsTransparency,
          audioBlob,
          onProgress: (stage, ratio) => {
            setProgressLabel(stage === "rendering" ? "Rendering frames..." : "Encoding video...");
            setProgress(Math.round(ratio * 100));
          },
        });

        const url = URL.createObjectURL(blob);
        downloadDataUrl(url, `${filenameBase}.${format}`);
        // Safari reads the blob asynchronously after the download is
        // triggered, so revoking immediately can truncate larger exports
        // (video/GIF). Give it a moment to actually finish reading.
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }

      toast.success("Export complete");
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Check the console for details.");
    } finally {
      setPlayheadTime(originalPlayhead);
      setIsExporting(false);
      setProgress(0);
      setProgressLabel("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isExporting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Export scrapbook</DialogTitle>
        </DialogHeader>

        {isExporting ? (
          <div className="flex flex-col gap-3 py-6">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {progressLabel || "Working..."}
            </div>
            {progress > 0 && <Progress value={progress} />}
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground">Format</Label>
              <div className="flex flex-col gap-2">
                {FORMAT_GROUPS.map((group) => (
                  <div key={group.label} className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {group.label}
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {group.formats.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFormat(f)}
                          className={
                            "rounded-md border px-2 py-1.5 text-xs font-medium uppercase transition-colors " +
                            (format === f
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-accent")
                          }
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-normal text-muted-foreground">Resolution</Label>
              <Select value={resolutionId} onValueChange={setResolutionId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_PRESETS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">
                {targetSize.width} × {targetSize.height}px
              </span>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal text-muted-foreground">
                Transparent background
              </Label>
              <Switch
                checked={transparent}
                disabled={!supportsTransparency}
                onCheckedChange={setTransparent}
              />
            </div>

            {isAnimated && (
              <p className="text-[11px] text-muted-foreground">
                Exports {Math.round(timelineEnd)}s of timeline at 24fps. This can take a while,
                especially at higher resolutions.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting} className="gap-2">
            <Download className="size-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
