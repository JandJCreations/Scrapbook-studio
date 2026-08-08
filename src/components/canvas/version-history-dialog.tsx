"use client";

import * as React from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteProjectVersion,
  listProjectVersions,
  loadProjectVersion,
  saveProjectFrame,
  saveProjectVersion,
  type ProjectVersionSummary,
} from "@/lib/sync/project-content-sync";
import { useAudioClips, useAudioStore, useAudioTracks } from "@/store/use-audio-store";
import { useCanvasFrame, useCanvasFrameStore } from "@/store/use-canvas-frame-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";

function formatVersionDate(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface VersionHistoryDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionHistoryDialog({
  projectId,
  open,
  onOpenChange,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = React.useState<ProjectVersionSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const objects = useCanvasObjects(projectId);
  const tracks = useAudioTracks(projectId);
  const clips = useAudioClips(projectId);
  const frame = useCanvasFrame(projectId);
  const loadObjects = useCanvasStore((s) => s.loadObjects);
  const loadTracksAndClips = useAudioStore((s) => s.loadTracksAndClips);
  const setFrame = useCanvasFrameStore((s) => s.setFrame);

  const fetchVersions = React.useCallback(async () => {
    try {
      const result = await listProjectVersions(projectId);
      setVersions(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load versions");
    }
  }, [projectId]);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLoading(true);
  }

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      await fetchVersions();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fetchVersions]);

  function refresh() {
    void fetchVersions();
  }

  async function handleSaveVersion() {
    setSaving(true);
    try {
      await saveProjectVersion(projectId, { objects, tracks, clips, frame });
      toast.success("Version saved");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save version");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    try {
      const snapshot = await loadProjectVersion(versionId);
      loadObjects(projectId, snapshot.objects);
      loadTracksAndClips(projectId, snapshot.tracks, snapshot.clips);
      setFrame(projectId, snapshot.frame);
      saveProjectFrame(projectId, snapshot.frame).catch(() => {});
      toast.success("Version restored");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore version");
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDelete(versionId: string) {
    setVersions((v) => v.filter((x) => x.id !== versionId));
    try {
      await deleteProjectVersion(versionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete version");
      refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Save a snapshot of this scrapbook&apos;s current state, or restore an earlier one.
          </DialogDescription>
        </DialogHeader>

        <Button onClick={handleSaveVersion} disabled={saving} className="gap-2">
          <History className="size-4" />
          {saving ? "Saving..." : "Save current version"}
        </Button>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <EmptyState
              compact
              icon={History}
              title="No versions yet"
              description="Saved versions of this scrapbook will appear here."
            />
          ) : (
            versions.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {version.label || "Untitled version"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatVersionDate(version.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={restoringId === version.id}
                    onClick={() => handleRestore(version.id)}
                  >
                    <RotateCcw className="size-3.5" />
                    {restoringId === version.id ? "Restoring..." : "Restore"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    aria-label="Delete version"
                    onClick={() => handleDelete(version.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
