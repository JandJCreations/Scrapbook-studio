"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { countSlots, estimateExport, exportableProject } from "@/lib/export/export-plan";
import { projectDuration } from "@/lib/timeline/clip-math";
import {
  ANIMATED_FORMATS,
  FORMAT_GROUPS,
  TRANSPARENCY_SUPPORTED_FORMATS,
  type ExportFormat,
} from "@/lib/export/export-formats";
import { RESOLUTION_PRESETS, resolveTargetSize } from "@/lib/export/export-resolutions";
import {
  exportStudioProject,
  type ExportStage,
  type StudioExportOptions,
  type StudioExportResult,
} from "@/lib/export/studio-export";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineProject } from "@/types/timeline";

const FORMAT_LABEL: Record<ExportFormat, string> = {
  png: "PNG",
  jpg: "JPG",
  pdf: "PDF",
  gif: "GIF",
  mp4: "MP4",
  mov: "MOV",
  webm: "WebM",
};
const FRAME_RATES = [15, 24, 30, 60];

const STAGE_TEXT: Record<ExportStage, string> = {
  preparing: "Getting ready…",
  mixing: "Mixing the sound…",
  rendering: "Rendering frames…",
  encoding: "Encoding…",
};

type Run =
  | { state: "idle" }
  | { state: "running"; stage: ExportStage; ratio: number }
  | { state: "done"; filename: string }
  | { state: "error"; message: string };

interface ExportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectName: string;
  project: TimelineProject;
  frame: FrameSize;
  urlFor(mediaId: string): string | null;
  /** Where a still picture is taken from, in timeline seconds. */
  playhead: number;
  /** The thing that does the work; replaced in tests. */
  exporter?: (options: StudioExportOptions) => Promise<StudioExportResult>;
}

function fileName(projectName: string, extension: string): string {
  const base = projectName.replace(/[^\w\- ]+/g, "").trim() || "project";
  return `${base}.${extension}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Choose a format and size, then render the project to a file and save it. */
export function ExportDialog({
  open,
  onOpenChange,
  projectName,
  project,
  frame,
  urlFor,
  playhead,
  exporter = exportStudioProject,
}: ExportDialogProps) {
  const [format, setFormat] = React.useState<ExportFormat>("mp4");
  const [resolutionId, setResolutionId] = React.useState("1080p");
  const [fps, setFps] = React.useState(30);
  const [transparent, setTransparent] = React.useState(false);
  const [run, setRun] = React.useState<Run>({ state: "idle" });
  const controller = React.useRef<AbortController | null>(null);

  // Leaving the page or closing the dialog stops an export that is still going.
  React.useEffect(() => () => controller.current?.abort(), []);

  const animated = ANIMATED_FORMATS.includes(format);
  const canBeTransparent = TRANSPARENCY_SUPPORTED_FORMATS.includes(format);
  const preset = RESOLUTION_PRESETS.find((p) => p.id === resolutionId) ?? RESOLUTION_PRESETS[1];
  const slots = countSlots(project);
  const size = resolveTargetSize(frame, preset);
  const estimate = estimateExport(projectDuration(exportableProject(project)), fps, size.width, size.height);
  const tooBig = animated && estimate.tooBig;
  const running = run.state === "running";

  function close(next: boolean) {
    if (!next) controller.current?.abort();
    onOpenChange(next);
  }

  async function start() {
    const abort = new AbortController();
    controller.current = abort;
    setRun({ state: "running", stage: "preparing", ratio: 0 });
    try {
      const result = await exporter({
        project,
        frame,
        urlFor,
        format,
        targetWidth: resolveTargetSize(frame, preset).width,
        fps,
        transparent: transparent && canBeTransparent,
        playhead,
        signal: abort.signal,
        onProgress: (stage, ratio) => {
          if (!abort.signal.aborted) setRun({ state: "running", stage, ratio });
        },
      });
      if (abort.signal.aborted) {
        // The cancel came too late to stop it (the encoder cannot be interrupted): drop the result.
        setRun({ state: "idle" });
        return;
      }
      const filename = fileName(projectName, result.extension);
      download(result.blob, filename);
      setRun({ state: "done", filename });
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        setRun({ state: "idle" });
        return;
      }
      setRun({ state: "error", message: error instanceof Error ? error.message : "The export failed." });
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4" />
            Export
          </DialogTitle>
          <DialogDescription>
            {animated ? "The whole project, from the start." : "The picture at the playhead."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {FORMAT_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
              <div role="radiogroup" aria-label={group.label} className="flex flex-wrap gap-1.5">
                {group.formats.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    role="radio"
                    aria-checked={format === value}
                    variant={format === value ? "secondary" : "outline"}
                    disabled={running}
                    onClick={() => setFormat(value)}
                  >
                    {FORMAT_LABEL[value]}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <Label className="w-24 text-xs font-normal text-muted-foreground">Resolution</Label>
            <select
              aria-label="Resolution"
              value={resolutionId}
              disabled={running}
              onChange={(event) => setResolutionId(event.target.value)}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            >
              {RESOLUTION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({resolveTargetSize(frame, p).width} × {resolveTargetSize(frame, p).height})
                </option>
              ))}
            </select>
          </div>

          {animated && (
            <div className="flex items-center gap-3">
              <Label className="w-24 text-xs font-normal text-muted-foreground">Frame rate</Label>
              <select
                aria-label="Frame rate"
                value={fps}
                disabled={running}
                onChange={(event) => setFps(Number(event.target.value))}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              >
                {FRAME_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} fps
                  </option>
                ))}
              </select>
            </div>
          )}

          {canBeTransparent && (
            <div className="flex items-center justify-between">
              <Label className="text-xs font-normal">Transparent background</Label>
              <Switch
                aria-label="Transparent background"
                checked={transparent}
                disabled={running}
                onCheckedChange={setTransparent}
              />
            </div>
          )}

          {tooBig && (
            <p role="status" className="text-xs text-destructive">
              This is too large to export in the browser ({estimate.frames} frames at {size.width} × {size.height}). Lower
              the resolution or the frame rate, or export a shorter project.
            </p>
          )}

          {slots > 0 && (
            <p className="text-xs text-muted-foreground">
              {slots === 1 ? "1 empty slot will be left out." : `${slots} empty slots will be left out.`}
            </p>
          )}

          {run.state === "running" && (
            <div className="space-y-1.5">
              <p className="text-xs">
                {STAGE_TEXT[run.stage]}
                {run.stage === "rendering" || run.stage === "encoding" ? ` ${Math.round(run.ratio * 100)}%` : ""}
              </p>
              <Progress value={Math.round(run.ratio * 100)} />
            </div>
          )}
          {run.state === "done" && <p className="text-xs">Saved as {run.filename}.</p>}
          {run.state === "error" && (
            <p role="alert" className="text-xs text-destructive">
              {run.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {running ? (
            <Button variant="outline" onClick={() => controller.current?.abort()}>
              Cancel export
            </Button>
          ) : (
            <Button disabled={tooBig} onClick={() => void start()}>
              Export
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
