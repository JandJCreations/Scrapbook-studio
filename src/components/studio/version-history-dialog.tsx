"use client";

import * as React from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage, VersionSummary } from "@/lib/sync/timeline-storage";
import type { TimelineProject } from "@/types/timeline";

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  storage: TimelineStorage;
  projectId: string;
  /** The project and frame as they are right now, for saving a version. */
  getSnapshot(): { project: TimelineProject; frame: FrameSize };
  /** Called with a version's project and frame to put in place of the current ones. */
  onRestore(project: TimelineProject, frame: FrameSize): void;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Save named copies of the project and bring one back later. */
export function VersionHistoryDialog({
  open,
  onOpenChange,
  storage,
  projectId,
  getSnapshot,
  onRestore,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = React.useState<VersionSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [label, setLabel] = React.useState("");
  // Answers from earlier requests must not overwrite newer ones or arrive after closing.
  const generation = React.useRef(0);

  const reload = React.useCallback(async () => {
    const mine = ++generation.current;
    try {
      const list = await storage.listVersions(projectId);
      if (generation.current === mine) {
        setVersions(list);
        setError(null);
      }
    } catch {
      if (generation.current === mine) setError("Couldn't load the saved versions.");
    }
  }, [storage, projectId]);

  React.useEffect(() => {
    if (!open) return;
    // The saved versions live in storage; read them whenever the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      generation.current += 1;
    };
  }, [open, reload]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const { project, frame } = getSnapshot();
      await storage.saveVersion(projectId, project, frame, label);
      setLabel("");
      await reload();
    }, "Couldn't save this version.");

  const restore = (version: VersionSummary) =>
    run(async () => {
      const { project, frame } = await storage.loadVersion(projectId, version.id);
      onRestore(project, frame);
      onOpenChange(false);
    }, "Couldn't restore that version.");

  const remove = (version: VersionSummary) =>
    run(async () => {
      await storage.deleteVersion(version.id);
      await reload();
    }, "Couldn't delete that version.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Version history
          </DialogTitle>
          <DialogDescription>Save a copy of the project now, or go back to an earlier one.</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            aria-label="Version name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name this version (optional)"
            maxLength={80}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          />
          <Button type="submit" size="sm" disabled={busy}>
            Save version
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        {versions === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {versions !== null && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">No saved versions yet.</p>
        )}
        {versions !== null && versions.length > 0 && (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {versions.map((version) => {
              const name = version.label ?? "Untitled version";
              return (
                <li key={version.id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground">{formatWhen(version.createdAt)}</p>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Restore ${name}`}
                    disabled={busy}
                    onClick={() => void restore(version)}
                  >
                    <RotateCcw className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${name}`}
                    disabled={busy}
                    onClick={() => void remove(version)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
