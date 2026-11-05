"use client";

import * as React from "react";
import { ArrowLeftRight, Image as ImageIcon, Music, Palette, Pause, Play, SlidersHorizontal } from "lucide-react";

import { AudioTab } from "@/components/studio/audio-tab";
import { ClipTools } from "@/components/studio/clip-tools";
import { EditTab } from "@/components/studio/edit-tab";
import { FiltersTab } from "@/components/studio/filters-tab";
import { TransitionsTab } from "@/components/studio/transitions-tab";
import { ExportDialog } from "@/components/studio/export-dialog";
import { StudioMediaPanel } from "@/components/studio/studio-media-panel";
import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioPreview } from "@/components/studio/studio-preview";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { useStudioMedia } from "@/components/studio/use-studio-media";
import { useStudioPlayback } from "@/components/studio/use-studio-playback";
import { useStudioThumbnail } from "@/components/studio/use-studio-thumbnail";
import { VersionHistoryDialog } from "@/components/studio/version-history-dialog";
import { WelcomeTour } from "@/components/studio/welcome-tour";
import { TimelineView } from "@/components/clip-timeline/timeline-view";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStudioTheme } from "@/hooks/use-studio-theme";
import { useTimelineSync } from "@/hooks/use-timeline-sync";
import { musicMediaId } from "@/lib/audio/music-keys";
import { MUSIC_LIBRARY, type MusicLibraryTrack } from "@/lib/audio/music-library-catalog";
import type { MediaDragPayload } from "@/lib/dom/media-drag";
import {
  addAudioClip,
  addToSequence,
  addToSequenceAt,
  fitMusicToVideo,
  musicStartTime,
  type AddResult,
  type EditorMedia,
} from "@/lib/editor/ops";
import { TOUR_SEEN_STORAGE_KEY } from "@/lib/onboarding/tour-steps";
import { readMediaInfo } from "@/lib/playback/browser";
import { withBundledAssets } from "@/lib/sync/bundled-assets";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { projectDuration } from "@/lib/timeline/clip-math";
import { videoLookForPreset } from "@/lib/appearance/filters";
import { patchPhotoAdjustments, patchVideoAdjustments } from "@/lib/editor/ops";
import { DEFAULT_TRANSITION_SECONDS, previousClip, setAllTransitions, setTransition } from "@/lib/timeline/transitions";
import type { FilterPreset } from "@/types/photo-adjustments";
import type { TransitionType } from "@/types/timeline";
import { blurOnMouseClick } from "@/lib/dom/blur-on-mouse-click";
import type { TimelineProject } from "@/types/timeline";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { MediaItem } from "@/types/media";

const FPS = 30;

type Tab = "media" | "audio" | "filters" | "transitions" | "edit";

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
        <Skeleton className="hidden h-full w-72 rounded-none lg:block" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    </div>
  );
}

/** The editor: pick photos, videos and music; the preview plays them through as the finished video. */
const TAB_ICONS = {
  media: ImageIcon,
  audio: Music,
  filters: Palette,
  transitions: ArrowLeftRight,
  edit: SlidersHorizontal,
} as const;

export function StudioView({ env }: { env: StudioEnv }) {
  useStudioTheme();
  const { status, frame, setFrame, reload } = useTimelineSync(env.projectId, env.storage);
  const project = useClipProjectStore(selectProject);
  const canUndo = useClipProjectStore(selectCanUndo);
  const canRedo = useClipProjectStore(selectCanRedo);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);
  const playing = useTransportStore((s) => s.playing);

  // The bundled music is answered from the catalog; everything else from the environment.
  const mediaSource = React.useMemo(() => withBundledAssets(env.media), [env.media]);
  useStudioMedia(mediaSource, project);
  const { containerRef, session, visuals } = useStudioPlayback({ media: mediaSource, frame });
  useStudioThumbnail({
    enabled: status.phase === "ready",
    frame,
    urlFor: mediaSource.urlFor,
    saveThumbnail: env.saveThumbnail,
    hasThumbnail: env.hasThumbnail,
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

  const [tab, setTab] = React.useState<Tab>("media");
  const selectedClip =
    selectedIds.length === 1 ? (project.clips.find((c) => c.id === selectedIds[0]) ?? null) : null;
  // Below a laptop-sized screen the panels open from a button as a sheet.
  const compact = useMediaQuery("(max-width: 1023px)");
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

  /** Runs an add; true when the new clip really is in the project (and is then the selection). */
  function put(add: (p: TimelineProject) => AddResult, trimToVideo = false): boolean {
    let result: AddResult | null = null;
    useClipProjectStore.getState().apply((p) => {
      result = add(p);
      return trimToVideo ? fitMusicToVideo(result.project, result.clipId) : result.project;
    });
    const added = result as AddResult | null;
    const stored = added && selectProject(useClipProjectStore.getState()).clips.some((c) => c.id === added.clipId);
    if (!added || !stored) return false;
    useClipProjectStore.getState().setSelectedClipIds([added.clipId]);
    return true;
  }

  /** Adds one photo or video to the end of the video; false when it could not be added (the reason is showing). `quiet` leaves the message alone on success. */
  async function addMedia(item: MediaItem, quiet = false, atTime?: number): Promise<boolean> {
    if (!frame) return false;
    try {
      const media = await loadEditorMedia(item);
      if (!media || !aliveRef.current) return false;
      if (!put((p) => (atTime === undefined ? addToSequence(p, media, frame) : addToSequenceAt(p, media, frame, atTime)))) {
        say("Couldn't add that to the video.");
        return false;
      }
      if (!quiet) say(null);
      return true;
    } catch (error) {
      say(error instanceof Error ? error.message : "Couldn't add that to the video.");
      return false;
    }
  }

  /** Ticked items go in one after another; one that fails does not stop the rest, and the failure stays on screen. */
  async function addMany(items: MediaItem[]) {
    say(null);
    let failed = 0;
    for (const item of items) if (!(await addMedia(item, true))) failed += 1;
    if (failed > 1) say(`Couldn't add ${failed} of ${items.length} items.`);
  }

  /** One of the user's own audio files, as the music: starts at the playhead and is cut at the end of the video. */
  async function addSong(item: MediaItem, at?: number) {
    if (!frame) return;
    try {
      const media = await loadEditorMedia(item);
      if (!media || !aliveRef.current) return;
      const playhead = at ?? useTransportStore.getState().time;
      if (put((p) => addAudioClip(p, media, frame, musicStartTime(p, playhead)), true)) say(null);
      else say("Couldn't add that to the video.");
    } catch (error) {
      say(error instanceof Error ? error.message : "Couldn't add that to the video.");
    }
  }

  function addMusic(track: MusicLibraryTrack, at?: number) {
    if (!frame) return;
    const media: EditorMedia = {
      mediaId: musicMediaId(track),
      name: track.name,
      kind: "audio",
      duration: track.duration,
      width: 0,
      height: 0,
    };
    const playhead = at ?? useTransportStore.getState().time;
    if (put((p) => addAudioClip(p, media, frame, musicStartTime(p, playhead)), true)) say(null);
    else say("Couldn't add that to the video.");
  }

  /** Something from the media or audio panel was dropped on the timeline: photos and videos go on the strip, songs on the music lane. */
  function dropMedia(payload: MediaDragPayload, time: number, trackType: "video" | "overlay" | "audio") {
    if (payload.source === "music") {
      const track = MUSIC_LIBRARY.find((t) => t.id === payload.id);
      if (track && trackType === "audio") addMusic(track, time);
      return;
    }
    const item = env.library.find((i) => i.id === payload.id);
    if (!item) return;
    if (item.type === "audio") {
      if (trackType === "audio") void addSong(item, time);
    } else if (trackType === "video") {
      void addMedia(item, false, time);
    }
  }

  /** Gives the selected photo or video the look of a filter from the gallery. */
  function applyFilter(preset: FilterPreset) {
    const clip = selectedClip;
    if (!clip) return;
    useClipProjectStore.getState().apply((p) =>
      clip.kind === "image"
        ? patchPhotoAdjustments(p, clip.id, { filterPreset: preset })
        : patchVideoAdjustments(p, clip.id, videoLookForPreset(preset)),
    );
  }

  /** Puts the transition picked in the gallery into the selected clip (null for a plain cut), at its current length. */
  function pickTransition(type: TransitionType | null) {
    const clip = selectedClip;
    if (!clip) return;
    useClipProjectStore.getState().apply((p) =>
      setTransition(p, clip.id, type === null ? null : { type, duration: clip.transition?.duration ?? DEFAULT_TRANSITION_SECONDS }),
    );
  }

  function applyTransitionToAll() {
    const clip = selectedClip;
    if (!clip) return;
    useClipProjectStore.getState().apply((p) => {
      const own = p.clips.find((c) => c.id === clip.id)?.transition;
      return own ? setAllTransitions(p, own) : p;
    });
  }

  /** The box on a cut in the timeline was clicked: select the clip after it and show the transitions to pick from. */
  function openTransition(clipId: string) {
    useClipProjectStore.getState().setSelectedClipIds([clipId]);
    setTab("transitions");
    if (compact) setToolsOpen(true);
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
      // The frame goes back, and the message says why.
      if (previous) setFrame(previous);
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
  const tabNames: Tab[] = compact
    ? ["media", "audio", "filters", "transitions", "edit"]
    : ["media", "audio", "filters", "transitions"];
  const shownTab: Tab = tabNames.includes(tab) ? tab : "media";

  const panels = (
    <>
      <div role="tablist" className="flex shrink-0 border-b">
        {tabNames.map((name) => (
          <button
            key={name}
            data-tour={`tab-${name}`}
            role="tab"
            type="button"
            aria-selected={shownTab === name}
            onClick={() => setTab(name)}
            className={
              "flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] capitalize " +
              (shownTab === name ? "border-b-2 border-primary font-medium text-primary" : "text-muted-foreground hover:text-foreground")
            }
          >
            {React.createElement(TAB_ICONS[name], { className: "size-5", "aria-hidden": true })}
            {name === "edit" ? "Details" : name}
          </button>
        ))}
      </div>
      {shownTab === "media" ? (
        <StudioMediaPanel
          items={env.library}
          loading={env.libraryLoading}
          onAdd={(item) => {
            void addMedia(item);
            setToolsOpen(false);
          }}
          onAddMany={(items) => {
            void addMany(items);
            setToolsOpen(false);
          }}
          onUpload={env.uploadFiles}
        />
      ) : shownTab === "audio" ? (
        <AudioTab
          items={env.library}
          loading={env.libraryLoading}
          onAddAudio={(item) => {
            void addSong(item);
            setToolsOpen(false);
          }}
          onAddMusic={(track) => {
            addMusic(track);
            setToolsOpen(false);
          }}
        />
      ) : shownTab === "filters" ? (
        <FiltersTab clip={selectedClip} onPick={applyFilter} />
      ) : shownTab === "transitions" ? (
        <TransitionsTab
          clip={selectedClip}
          hasPrevious={selectedClip ? previousClip(project, selectedClip) !== null : false}
          onPick={pickTransition}
          onApplyToAll={applyTransitionToAll}
        />
      ) : (
        <EditTab clip={selectedClip} />
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
            <div className="flex min-h-0 flex-1 flex-col">{panels}</div>
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
        {!compact && <aside className="flex w-72 shrink-0 flex-col border-r">{panels}</aside>}
        <main className="flex min-w-0 flex-1 flex-col">
          <StudioPreview containerRef={containerRef} />
          <div className="flex items-center gap-3 border-t px-3 py-2" onClickCapture={blurOnMouseClick}>
            {compact && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  data-tour="tools-button"
                  onClick={() => {
                    setTab("media");
                    setToolsOpen(true);
                  }}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Edit selected"
                  disabled={!selectedClip}
                  onClick={() => {
                    setTab("edit");
                    setToolsOpen(true);
                  }}
                >
                  <SlidersHorizontal className="size-4" />
                </Button>
              </>
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
          <ClipTools />
          <div data-tour="timeline" className="shrink-0 border-t p-2">
            <TimelineView
              fps={FPS}
              onSeek={(t) => session?.seek(t)}
              onToggle={() => session?.toggle()}
              onStep={(direction) => session?.step(direction, FPS)}
              visuals={visuals ?? undefined}
              onDropMedia={dropMedia}
              onOpenTransition={openTransition}
              onAddClip={() => {
                setTab("media");
                if (compact) setToolsOpen(true);
              }}
            />
          </div>
        </main>
        {!compact && (
          <aside className="flex w-72 shrink-0 flex-col border-l" aria-label="Details">
            <EditTab clip={selectedClip} />
          </aside>
        )}
      </div>
    </div>
  );
}
