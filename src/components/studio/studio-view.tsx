"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";

import { TimelineView } from "@/components/clip-timeline/timeline-view";
import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioMediaPanel } from "@/components/studio/studio-media-panel";
import { StudioStage } from "@/components/studio/studio-stage";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { TextTab } from "@/components/studio/text-tab";
import { useStudioMedia } from "@/components/studio/use-studio-media";
import { useStudioPlayback } from "@/components/studio/use-studio-playback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimelineSync } from "@/hooks/use-timeline-sync";
import {
  addAsOverlay,
  addAudioClip,
  addToSequence,
  type AddResult,
  type EditorMedia,
} from "@/lib/editor/ops";
import { readMediaInfo } from "@/lib/playback/browser";
import { projectDuration } from "@/lib/timeline/clip-math";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { MediaItem } from "@/types/media";

const FPS = 30;

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function StudioSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="h-12 w-full rounded-none" />
      <div className="flex flex-1">
        <Skeleton className="hidden h-full w-72 rounded-none sm:block" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    </div>
  );
}

export function StudioView({ env }: { env: StudioEnv }) {
  const { status, frame, setFrame, reload } = useTimelineSync(env.projectId, env.storage);
  const project = useClipProjectStore(selectProject);
  const canUndo = useClipProjectStore(selectCanUndo);
  const canRedo = useClipProjectStore(selectCanRedo);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);
  const playing = useTransportStore((s) => s.playing);

  useStudioMedia(env.media, project);
  const { containerRef, session, visuals } = useStudioPlayback({ media: env.media, frame });

  // Add and save work can outlive the page; it must not touch shared state after that.
  const aliveRef = React.useRef(false);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [message, setMessage] = React.useState<string | null>(null);
  const say = (text: string | null) => {
    if (aliveRef.current) setMessage(text);
  };

  // The sidebar follows the selection: picking a text clip opens the Text tab.
  const [tab, setTab] = React.useState<"media" | "text">("media");
  const selectedText =
    selectedIds.length === 1
      ? (project.clips.find((c) => c.id === selectedIds[0] && c.kind === "text") ?? null)
      : null;
  const [lastTextId, setLastTextId] = React.useState<string | null>(null);
  if ((selectedText?.id ?? null) !== lastTextId) {
    setLastTextId(selectedText?.id ?? null);
    if (selectedText) setTab("text");
  }

  async function addMedia(item: MediaItem, mode: "sequence" | "overlay") {
    if (!frame) return;
    try {
      await env.media.ensure([item.id]);
      const url = env.media.urlFor(item.id) ?? item.url;
      if (!url) {
        say("That file isn't available right now.");
        return;
      }
      let info = { duration: item.duration ?? 0, width: 0, height: 0 };
      try {
        info = await readMediaInfo(url, item.type);
      } catch {
        if (item.type !== "image") {
          say("Couldn't read that file.");
          return;
        }
      }
      if (!aliveRef.current) return;

      const media: EditorMedia = {
        mediaId: item.id,
        name: item.name,
        kind: item.type,
        duration: info.duration || item.duration || 0,
        width: info.width,
        height: info.height,
      };
      const at = useTransportStore.getState().time;
      let result: AddResult | null = null;
      useClipProjectStore.getState().apply((p) => {
        result =
          media.kind === "audio"
            ? addAudioClip(p, media, frame, at)
            : mode === "overlay"
              ? addAsOverlay(p, media, frame, at)
              : addToSequence(p, media, frame);
        return result.project;
      });
      const added = result as AddResult | null;
      const stored =
        added && selectProject(useClipProjectStore.getState()).clips.some((c) => c.id === added.clipId);
      if (!added || !stored) {
        say("Couldn't add that to the project.");
        return;
      }
      useClipProjectStore.getState().setSelectedClipIds([added.clipId]);
      say(null);
    } catch (error) {
      say(error instanceof Error ? error.message : "Couldn't add that to the project.");
    }
  }

  function changeFrame(preset: { width: number; height: number }) {
    const previous = frame;
    setFrame(preset);
    env.saveFrame(preset).catch(() => {
      if (!aliveRef.current) return;
      setFrame(previous);
      say("Couldn't save the frame size.");
    });
  }

  if (status.phase === "conflict") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm">This project changed in another window.</p>
        <Button onClick={reload}>Reload</Button>
      </div>
    );
  }
  // Save failures keep the phase "ready", so an "error" phase is always a failed load.
  if (status.phase === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">Couldn&apos;t load this project</p>
        {status.error && <p className="text-xs text-muted-foreground">{status.error}</p>}
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  }
  if (status.phase === "loading") return <StudioSkeleton />;

  const duration = projectDuration(project);

  return (
    <div className="flex h-full flex-col">
      <StudioToolbar
        projectName={env.projectName}
        backHref={env.backHref}
        status={status}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => useClipProjectStore.getState().undo()}
        onRedo={() => useClipProjectStore.getState().redo()}
        frame={frame}
        onFrameChange={changeFrame}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r sm:flex">
          <div role="tablist" className="flex shrink-0 border-b">
            {(["media", "text"] as const).map((name) => (
              <button
                key={name}
                role="tab"
                type="button"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={
                  "flex-1 px-3 py-2 text-sm capitalize " +
                  (tab === name ? "border-b-2 border-primary font-medium" : "text-muted-foreground")
                }
              >
                {name}
              </button>
            ))}
          </div>
          {tab === "media" ? (
            <StudioMediaPanel
              items={env.library}
              loading={env.libraryLoading}
              onAdd={(item, mode) => void addMedia(item, mode)}
              onUpload={env.uploadFiles}
            />
          ) : (
            <TextTab frame={frame} selectedText={selectedText} />
          )}
          {message && (
            <p role="alert" className="border-t p-3 text-xs text-destructive">
              {message}
            </p>
          )}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <StudioStage containerRef={containerRef} frame={frame} />
          <div className="flex items-center gap-3 border-t px-3 py-2">
            <Button
              size="sm"
              variant="secondary"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => session?.toggle()}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatClock(time)} / {formatClock(duration)}
            </span>
          </div>
          <div className="shrink-0 border-t p-2">
            <TimelineView
              fps={FPS}
              onSeek={(t) => session?.seek(t)}
              onToggle={() => session?.toggle()}
              onStep={(direction) => session?.step(direction, FPS)}
              visuals={visuals ?? undefined}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
