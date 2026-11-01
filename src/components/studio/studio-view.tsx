"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";

import { TimelineView } from "@/components/clip-timeline/timeline-view";
import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioMediaPanel } from "@/components/studio/studio-media-panel";
import { StudioStage } from "@/components/studio/studio-stage";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { EditTab } from "@/components/studio/edit-tab";
import { TextTab } from "@/components/studio/text-tab";
import { AssetsTab } from "@/components/studio/assets-tab";
import { WelcomeTour } from "@/components/studio/welcome-tour";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TOUR_SEEN_STORAGE_KEY } from "@/lib/onboarding/tour-steps";
import { ExportDialog } from "@/components/studio/export-dialog";
import { VersionHistoryDialog } from "@/components/studio/version-history-dialog";
import { SlotFillPanel } from "@/components/studio/slot-fill-panel";
import { LayersTab } from "@/components/studio/layers-tab";
import { useStudioMedia } from "@/components/studio/use-studio-media";
import { useNaturalSize } from "@/components/studio/use-natural-size";
import { useStudioPlayback } from "@/components/studio/use-studio-playback";
import { useStudioThumbnail } from "@/components/studio/use-studio-thumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimelineSync } from "@/hooks/use-timeline-sync";
import {
  addAsOverlay,
  addAudioClip,
  addSticker,
  addToSequence,
  fillPlaceholder,
  type AddResult,
  type EditorMedia,
} from "@/lib/editor/ops";
import { assetMediaId } from "@/lib/assets/asset-keys";
import { musicMediaId } from "@/lib/audio/music-keys";
import type { MusicLibraryTrack } from "@/lib/audio/music-library-catalog";
import { readMediaInfo } from "@/lib/playback/browser";
import { withBundledAssets } from "@/lib/sync/bundled-assets";
import { templateToProject } from "@/lib/templates/template-to-project";
import { createId } from "@/lib/timeline/ids";
import type { ScrapbookTemplate } from "@/types/template";
import type { ScrapbookAsset } from "@/types/asset";
import { projectDuration } from "@/lib/timeline/clip-math";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineProject } from "@/types/timeline";
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

  // Catalog art (stickers) is answered from the catalog; everything else from the environment.
  const mediaSource = React.useMemo(() => withBundledAssets(env.media), [env.media]);
  useStudioMedia(mediaSource, project);
  const { containerRef, session, visuals } = useStudioPlayback({ media: mediaSource, frame });
  useStudioThumbnail({
    enabled: status.phase === "ready",
    frame,
    urlFor: mediaSource.urlFor,
    saveThumbnail: env.saveThumbnail,
  });

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

  // The sidebar follows the selection: a text clip opens the Text tab, a
  // picture, video or music clip opens the Edit tab. A clip the user has just
  // added from the Media tab does not, so adding several files in a row works.
  const [tab, setTab] = React.useState<"media" | "assets" | "text" | "edit" | "layers">("media");
  const selectedClip =
    selectedIds.length === 1 ? (project.clips.find((c) => c.id === selectedIds[0]) ?? null) : null;
  const selectedText = selectedClip?.kind === "text" ? selectedClip : null;
  const natural = useNaturalSize(mediaSource, selectedClip);
  const [lastClipId, setLastClipId] = React.useState<string | null>(null);
  const [justAddedId, setJustAddedId] = React.useState<string | null>(null);
  // On a phone the sidebar is a sheet that slides up from a Tools button.
  const compact = useMediaQuery("(max-width: 639px)");
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [tourOpen, setTourOpen] = React.useState(false);
  const ready = status.phase === "ready";
  React.useEffect(() => {
    if (!env.welcomeTour || !ready) return;
    try {
      if (window.localStorage.getItem(TOUR_SEEN_STORAGE_KEY)) return;
    } catch {
      return;
    }
    // Opening the tour once, the first time the editor is ready on this browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage, which only exists on the client
    setTourOpen(true);
  }, [env.welcomeTour, ready]);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [pendingTemplate, setPendingTemplate] = React.useState<ScrapbookTemplate | null>(null);
  if ((selectedClip?.id ?? null) !== lastClipId) {
    setLastClipId(selectedClip?.id ?? null);
    if (selectedClip && selectedClip.id === justAddedId) {
      setJustAddedId(null);
    } else if (selectedClip && tab !== "layers") {
      // The Layers tab is for picking clips, so picking one there does not leave it.
      setTab(selectedClip.kind === "text" ? "text" : "edit");
    }
  }

  /** Looks up a library file and reads its size and length; null (with a message) if it cannot be used. */
  async function loadEditorMedia(item: MediaItem): Promise<EditorMedia | null> {
    await mediaSource.ensure([item.id]);
    const url = mediaSource.urlFor(item.id) ?? item.url;
    if (!url) {
      say("That file isn't available right now.");
      return null;
    }
    let info = { duration: item.duration ?? 0, width: 0, height: 0 };
    try {
      info = await readMediaInfo(url, item.type);
    } catch {
      if (item.type !== "image") {
        say("Couldn't read that file.");
        return null;
      }
    }
    return {
      mediaId: item.id,
      name: item.name,
      kind: item.type,
      duration: info.duration || item.duration || 0,
      width: info.width,
      height: info.height,
    };
  }

  async function fillSlot(item: MediaItem, slotId: string) {
    try {
      const media = await loadEditorMedia(item);
      if (!media || !aliveRef.current) return;
      useClipProjectStore.getState().apply((p) => fillPlaceholder(p, slotId, media));
      const filled = selectProject(useClipProjectStore.getState()).clips.find((c) => c.id === slotId);
      if (filled?.isPlaceholder !== false) say("Couldn't put that in the slot.");
      else say(null);
    } catch (error) {
      say(error instanceof Error ? error.message : "Couldn't put that in the slot.");
    }
  }

  function applyTemplate(template: ScrapbookTemplate) {
    const { project: built, frame: templateFrame } = templateToProject(template, project.id, createId);
    useClipProjectStore.getState().apply(() => built);
    useClipProjectStore.getState().setSelectedClipIds([]);
    setPendingTemplate(null);
    if (!frame || frame.width !== templateFrame.width || frame.height !== templateFrame.height) {
      changeFrame(templateFrame);
    }
  }

  function chooseTemplate(template: ScrapbookTemplate) {
    // Replacing a project that already has something in it needs a yes first.
    if (project.clips.length > 0) setPendingTemplate(template);
    else applyTemplate(template);
  }

  async function addMedia(item: MediaItem, mode: "sequence" | "overlay") {
    if (!frame) return;
    try {
      const media = await loadEditorMedia(item);
      if (!media || !aliveRef.current) return;
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
      setJustAddedId(added.clipId);
      say(null);
    } catch (error) {
      say(error instanceof Error ? error.message : "Couldn't add that to the project.");
    }
  }

  function addMusic(track: MusicLibraryTrack) {
    if (!frame) return;
    const media: EditorMedia = {
      mediaId: musicMediaId(track),
      name: track.name,
      kind: "audio",
      duration: track.duration,
      width: 0,
      height: 0,
    };
    const at = useTransportStore.getState().time;
    let result: AddResult | null = null;
    useClipProjectStore.getState().apply((p) => {
      result = addAudioClip(p, media, frame, at);
      return result.project;
    });
    const added = result as AddResult | null;
    if (!added) return;
    useClipProjectStore.getState().setSelectedClipIds([added.clipId]);
    setJustAddedId(added.clipId);
  }

  function addAsset(asset: ScrapbookAsset) {
    if (!frame) return;
    const art = { mediaId: assetMediaId(asset), name: asset.name, width: asset.width, height: asset.height };
    const at = useTransportStore.getState().time;
    let result: AddResult | null = null;
    useClipProjectStore.getState().apply((p) => {
      result = addSticker(p, art, frame, at);
      return result.project;
    });
    const added = result as AddResult | null;
    if (!added) return;
    useClipProjectStore.getState().setSelectedClipIds([added.clipId]);
    setJustAddedId(added.clipId);
  }

  /** Closes the tour, and remembers that it has been seen so it does not open by itself again. */
  function closeTour(open: boolean) {
    setTourOpen(open);
    if (open) return;
    try {
      window.localStorage.setItem(TOUR_SEEN_STORAGE_KEY, "1");
    } catch {
      // Private mode: the tour may show again next time.
    }
  }

  function restoreVersion(restored: TimelineProject, restoredFrame: FrameSize) {
    useClipProjectStore.getState().apply(() => restored);
    useClipProjectStore.getState().setSelectedClipIds([]);
    if (!frame || frame.width !== restoredFrame.width || frame.height !== restoredFrame.height) {
      changeFrame(restoredFrame);
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

  const sidebar = (
    <>
            <div role="tablist" className="flex shrink-0 border-b">
              {(["media", "assets", "text", "edit", "layers"] as const).map((name) => (
                <button
                  key={name}
                  data-tour={`tab-${name}`}
                  role="tab"
                  type="button"
                  aria-selected={tab === name}
                  onClick={() => setTab(name)}
                  className={
                    "flex-1 px-1 py-2 text-xs capitalize " +
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
                onAdd={(item, mode) => {
                  void addMedia(item, mode);
                  setToolsOpen(false);
                }}
                onUpload={env.uploadFiles}
              />
            ) : tab === "assets" ? (
              <AssetsTab
                onAdd={(...args: Parameters<typeof addAsset>) => {
                  addAsset(...args);
                  setToolsOpen(false);
                }}
                onTemplate={chooseTemplate}
                onAddMusic={(...args: Parameters<typeof addMusic>) => {
                  addMusic(...args);
                  setToolsOpen(false);
                }}
              />
            ) : tab === "layers" ? (
              <LayersTab />
            ) : tab === "text" ? (
              <TextTab frame={frame} selectedText={selectedText} onSeek={(t) => session?.seek(t)} />
            ) : selectedClip?.isPlaceholder ? (
              <SlotFillPanel
                items={env.library}
                loading={env.libraryLoading}
                onFill={(item) => void fillSlot(item, selectedClip.id)}
              />
            ) : (
              <EditTab clip={selectedClip} natural={natural} onSeek={(t) => session?.seek(t)} />
            )}
            {pendingTemplate && (
              <div role="alertdialog" aria-label="Replace the project" className="space-y-2 border-t p-3 text-xs">
                <p>
                  Replace everything in this project with the {pendingTemplate.name} template? The frame size changes to match it.
                </p>
                <div className="flex gap-2">
                  <Button size="xs" onClick={() => applyTemplate(pendingTemplate)}>
                    Replace
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setPendingTemplate(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
    </>
  );

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
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenTour={() => setTourOpen(true)}
        onOpenExport={() => setExportOpen(true)}
      />
      <WelcomeTour open={tourOpen} onOpenChange={closeTour} />
      {compact && (
        <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
          <SheetContent side="bottom" className="h-[70svh] gap-0 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Tools</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
          </SheetContent>
        </Sheet>
      )}
      {frame && (
        <>
          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            projectName={env.projectName}
            project={project}
            frame={frame}
            urlFor={mediaSource.urlFor}
            playhead={time}
          />
          <VersionHistoryDialog
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            storage={env.storage}
            projectId={env.projectId}
            getSnapshot={() => ({ project: selectSavableProject(useClipProjectStore.getState()), frame })}
            onRestore={restoreVersion}
          />
        </>
      )}
      <div className="flex min-h-0 flex-1">
        {!compact && (
          <aside className="flex w-72 shrink-0 flex-col border-r">
            {sidebar}
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div data-tour="stage" className="flex min-h-0 flex-1 flex-col">
            <StudioStage
              containerRef={containerRef}
              frame={frame}
              onGestureStart={() => {
                if (useTransportStore.getState().playing) session?.pause();
              }}
            />
          </div>
          <div className="flex items-center gap-3 border-t px-3 py-2">
            {compact && (
              <Button size="sm" variant="outline" data-tour="tools-button" onClick={() => setToolsOpen(true)}>
                Tools
              </Button>
            )}
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
          {message && (
            <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
              {message}
            </p>
          )}
          <div data-tour="timeline" className="shrink-0 border-t p-2">
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
