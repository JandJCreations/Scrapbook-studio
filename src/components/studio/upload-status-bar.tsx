"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/types/media";

interface UploadStatusBarProps {
  library: MediaItem[];
  /** Opens the photos panel, where each failed upload has its own Retry. */
  onShowUploads(): void;
  onRetryAll?(): void;
}

/**
 * One line under the preview while photos and videos upload: how many are
 * done, and a reminder to keep the page open (an iPhone pauses uploads when
 * the screen locks). Hidden when nothing is uploading or failed.
 */
export function UploadStatusBar({ library, onShowUploads, onRetryAll }: UploadStatusBarProps) {
  // The batch is everything picked in this visit: counted from the first upload until the last one ends.
  const busy = library.filter((item) => item.status === "processing");
  const failed = library.filter((item) => item.status === "error" && item.retryable);
  const [batch, setBatch] = React.useState<Set<string>>(new Set());
  const busyKey = busy.map((item) => item.id).join(",");
  React.useEffect(() => {
    // Adds new uploads to the batch; an empty queue starts a fresh one next time.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the batch follows the store's uploads
    setBatch((current) => {
      if (busyKey === "") return current.size === 0 ? current : new Set();
      const next = new Set(current);
      for (const id of busyKey.split(",")) next.add(id);
      return next.size === current.size ? current : next;
    });
  }, [busyKey]);

  if (busy.length === 0 && failed.length === 0) return null;

  const total = Math.max(batch.size, busy.length);
  const done = total - busy.length;
  const percent = total === 0 ? 0 : Math.round(((done + busy.reduce((sum, item) => sum + item.progress / 100, 0)) / total) * 100);

  return (
    <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-1.5 text-xs" data-testid="upload-status">
      {busy.length > 0 ? (
        <>
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <p role="status" className="min-w-0 flex-1">
            <span className="font-medium">
              {done} of {total} uploaded
            </span>{" "}
            <span className="text-muted-foreground">· keep this page open</span>
          </p>
          <span className="text-muted-foreground tabular-nums">{percent}%</span>
          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-border" aria-hidden>
            <span className="block h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </span>
        </>
      ) : (
        <>
          <p role="alert" className="min-w-0 flex-1 text-destructive">
            {failed.length === 1 ? "1 file didn't upload." : `${failed.length} files didn't upload.`}
          </p>
          {onRetryAll && (
            <Button size="sm" variant="secondary" className="h-8" onClick={onRetryAll}>
              Try again
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={onShowUploads}>
            Show
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Keeps the screen on while `active`, so a phone doesn't lock (and pause the
 * uploads) halfway through. Does nothing where the browser can't.
 */
export function useKeepScreenOn(active: boolean): void {
  React.useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (cancelled) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    };
    request();
    // The lock goes when the page is hidden; take it again on return.
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
