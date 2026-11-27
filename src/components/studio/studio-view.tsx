"use client";

import * as React from "react";
import { ArrowLeftRight, Image as ImageIcon, Music, Palette, Plus, SlidersHorizontal, Type } from "lucide-react";

import { AudioTab } from "@/components/studio/audio-tab";
import { ClipTools } from "@/components/studio/clip-tools";
import { EditTab } from "@/components/studio/edit-tab";
import { FiltersTab } from "@/components/studio/filters-tab";
import { TextTab } from "@/components/studio/text-tab";
import { PreviewControls } from "@/components/studio/preview-controls";
import { ProjectPanel } from "@/components/studio/project-panel";
import { TransitionsTab } from "@/components/studio/transitions-tab";
import { ExportDialog } from "@/components/studio/export-dialog";
import { StudioMediaPanel } from "@/components/studio/studio-media-panel";
import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioPreview } from "@/components/studio/studio-preview";
import { UploadStatusBar, useKeepScreenOn } from "@/components/studio/upload-status-bar";
import { StartCard } from "@/components/studio/start-card";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { useStudioMedia } from "@/components/studio/use-studio-media";
import { useStudioPlayback } from "@/components/studio/use-studio-playback";
import { useStudioThumbnail } from "@/components/studio/use-studio-thumbnail";
import { useUploadGuard } from "@/components/studio/use-upload-guard";
import { useVoiceoverRecorder } from "@/components/studio/use-voiceover-recorder";
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
import { buildMontage } from "@/lib/editor/montage";
import { refitToFrame } from "@/lib/timeline/refit";
import { videoEnd } from "@/lib/timeline/clip-math";
import { MUSIC_LIBRARY, type MusicLibraryTrack } from "@/lib/audio/music-library-catalog";
import type { MediaDragPayload } from "@/lib/dom/media-drag";
import {
  addMusicClip,
  addVoiceoverClip,
  addToSequence,
  addToSequenceAt,
  fitMusicToVideo,
  musicStartTime,
  type AddResult,
  type EditorMedia,
} from "@/lib/editor/ops";
import { TOUR_SEEN_STORAGE_KEY } from "@/lib/onboarding/tour-steps";
import { readMediaInfo } from "@/lib/playback/browser";
import { isUsable } from "@/lib/media/local-media";
import { withBundledAssets } from "@/lib/sync/bundled-assets";
import type { FrameSize } from "@/lib/sync/timeline-document";
import { projectDuration } from "@/lib/timeline/clip-math";
import { videoLookForPreset } from "@/lib/appearance/filters";
import { addCaptionFor, addText, applyTextStyle, type TextStyle } from "@/lib/editor/text-ops";
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

type Tab = "media" | "audio" | "text" | "filters" | "transitions" | "edit";

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
  text: Type,
  filters: Palette,
  transitions: ArrowLeftRight,
  edit: SlidersHorizontal,
} as const;

export function StudioView({ env }: { env: StudioEnv }) {
  useStudioTheme();
  const { status, frame, setFrame, reload } = useTimelineSync(env.projectId, env.storage);
  const project = useClipProjectStore(selectProject);
  // The frame shape each side of a shape change was laid out for, so undo and redo can restore it.
  const frameFor = React.useRef(new WeakMap<TimelineProject, FrameSize>());
  React.useEffect(() => {
    const wanted = frameFor.current.get(project);
    if (!wanted || !frame || (wanted.width === frame.width && wanted.height === frame.height)) return;
    setFrame(wanted);
    env.saveFrame(wanted).catch(() => setFrame(frame));
  }, [project, frame, setFrame, env]);
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
  // A file the video uses that is still uploading would be lost if the page closed; one that failed to upload is missing for good.
  const usedMedia = new Set(project.clips.map((clip) => clip.mediaId));
  useUploadGuard(env.library.some((item) => item.status === "processing" && usedMedia.has(item.id)));
  useKeepScreenOn(env.library.some((item) => item.status === "processing"));
  // Ones that can be tried again are counted in the upload bar, with its Try again button.
  const failedUploads = env.library.filter((item) => item.status === "error" && !item.retryable && usedMedia.has(item.id));
  const [message, setMessage] = React.useState<{ text: string; tone: "error" | "info" } | null>(null);
  const say = (text: string | null, tone: "error" | "info" = "error") => {
    if (aliveRef.current) setMessage(text === null ? null : { text, tone });
  };

  const [tab, setTab] = React.useState<Tab>("media");
  // Opens the media panel's file picker while that panel is showing.
  const openPickerRef = React.useRef<(() => void) | null>(null);
  const selectedClip =
    selectedIds.length === 1 ? (project.clips.find((c) => c.id === selectedIds[0]) ?? null) : null;
  // Below a laptop-sized screen the panels open from a button as a sheet.
  const compact = useMediaQuery("(max-width: 1023px)");
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [tourOpen, setTourOpen] = React.useState(false);
  const ready = status.phase === "ready";
  // An empty video has the start card to show the way; the tour waits until there is something to edit.
  const hasClips = project.clips.length > 0;
  React.useEffect(() => {
    if (!env.welcomeTour || !ready || !hasClips) return;
    try {
      if (window.localStorage.getItem(TOUR_SEEN_STORAGE_KEY)) return;
    } catch {
      return;
    }
    // Opening the tour once, the first time the editor is ready on this browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage, which only exists on the client
    setTourOpen(true);
  }, [env.welcomeTour, ready, hasClips]);
  const previewRef = React.useRef<HTMLDivElement>(null);
  // The start card's own file picker. The new library ids tell the picked files apart (or, where the
  // upload doesn't say, what was in the library before the pick). Files picked in the New video dialog
  // arrive as ids already.
  const startPicker = React.useRef<HTMLInputElement>(null);
  const [startPick, setStartPick] = React.useState<{ ids?: Set<string>; before?: Set<string> } | null>(() =>
    env.startPickedIds?.length ? { ids: new Set(env.startPickedIds) } : null,
  );
  const finishStartPick = () => {
    setStartPick(null);
    env.clearStartPick?.();
  };
  const [startDismissed, setStartDismissed] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  /** Looks up a library file and reads its size and length; null (with a message) if it cannot be used. */
  async function loadEditorMedia(item: MediaItem): Promise<EditorMedia | null> {
    await mediaSource.ensure([item.id]);
    const url = mediaSource.urlFor(item.id) ?? item.localUrl ?? item.url;
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

  /** The ticked photos and clips as a finished video: in order, moving, with transitions, a title and a song. One undo step. */
  async function makeVideo(items: MediaItem[]) {
    if (!frame) return;
    say("Making your video…");
    const media: EditorMedia[] = [];
    for (const item of items) {
      const loaded = await loadEditorMedia(item);
      if (!aliveRef.current) return;
      if (loaded) media.push(loaded);
    }
    if (media.length === 0) {
      say("Couldn't use any of those files.");
      return;
    }
    // A video that already has music keeps it; otherwise a bright song from the library goes underneath.
    const hasMusic = project.clips.some((clip) => clip.kind === "audio");
    const track = MUSIC_LIBRARY.find((t) => t.mood === "Upbeat") ?? MUSIC_LIBRARY[0];
    const music: EditorMedia | null =
      hasMusic || !track
        ? null
        : { mediaId: musicMediaId(track), name: track.name, kind: "audio", duration: track.duration, width: 0, height: 0 };
    useClipProjectStore.getState().apply((p) =>
      buildMontage(p, media, frame, { title: videoEnd(p) > 0 ? "" : env.projectName, music }).project,
    );
    useClipProjectStore.getState().setSelectedClipIds([]);
    session?.seek(0);
    say(media.length < items.length ? `Made your video. ${items.length - media.length} file(s) couldn't be used.` : null);
  }

  /** One of the user's own audio files, as the music: starts at the playhead and is cut at the end of the video. */
  async function addSong(item: MediaItem, at?: number) {
    if (!frame) return;
    try {
      const media = await loadEditorMedia(item);
      if (!media || !aliveRef.current) return;
      putMusic(media, at);
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
    putMusic(media, at);
  }

  /**
   * Puts a song on the music lane, cut at the end of the video. Dropped music
   * starts where it was dropped; added music starts at the playhead, or the
   * beginning if that is past the end. A song it lands on top of is swapped out.
   */
  function putMusic(media: EditorMedia, at?: number) {
    if (!frame) return;
    const playhead = useTransportStore.getState().time;
    let replaced: string[] = [];
    const added = put((p) => {
      const result = addMusicClip(p, media, frame, at !== undefined ? Math.max(0, at) : musicStartTime(p, playhead));
      replaced = result.replaced;
      return result;
    }, true);
    if (!added) say("Couldn't add that to the video.");
    else if (replaced.length > 0) say(`Swapped ${replaced.join(", ")} for ${media.name}. Press undo to put it back.`, "info");
    else say(null);
  }

  /** Records the user's voice from the playhead while the video plays; the take lands on the voiceover lane. */
  const recorder = useVoiceoverRecorder();
  const recordFromRef = React.useRef(0);
  const [savingTake, setSavingTake] = React.useState(false);
  async function toggleVoiceover() {
    if (recorder.state.phase === "recording") {
      session?.pause();
      setSavingTake(true);
      try {
        const take = await recorder.stop();
        if (!take || !frame || !aliveRef.current) return;
        const ids = env.uploadFiles?.([take.file]);
        const mediaId = Array.isArray(ids) ? ids[0] : undefined;
        if (!mediaId) {
          say("Couldn't keep that recording.");
          return;
        }
        await mediaSource.ensure([mediaId]);
        const media: EditorMedia = {
          mediaId,
          name: take.file.name.replace(/\.[a-z0-9]+$/i, ""),
          kind: "audio",
          duration: take.duration,
          width: 0,
          height: 0,
        };
        if (put((p) => addVoiceoverClip(p, media, frame, recordFromRef.current))) say(null);
        else say("Couldn't add the recording to the video.");
      } finally {
        if (aliveRef.current) setSavingTake(false);
      }
      return;
    }
    if (!env.uploadFiles) {
      say("Recording isn't available here.");
      return;
    }
    // Inside the click: browsers only let sound start from a gesture.
    void session?.graph.resume();
    recordFromRef.current = useTransportStore.getState().time;
    say(null);
    const problem = await recorder.start();
    if (problem) say(problem);
    else if (aliveRef.current) session?.play();
  }
  // The take ends when the video stops: at its end, or when the user pauses.
  // Otherwise the microphone keeps going over a silent, frozen picture.
  const toggleVoiceoverRef = React.useRef(toggleVoiceover);
  React.useEffect(() => {
    toggleVoiceoverRef.current = toggleVoiceover;
  });
  const heardPlayRef = React.useRef(false);
  const recording = recorder.state.phase === "recording";
  React.useEffect(() => {
    if (!recording) {
      heardPlayRef.current = false;
      return;
    }
    if (playing) {
      heardPlayRef.current = true;
      return;
    }
    if (heardPlayRef.current) {
      heardPlayRef.current = false;
      void toggleVoiceoverRef.current();
    }
  }, [recording, playing]);
  const [recordedFor, setRecordedFor] = React.useState(0);
  React.useEffect(() => {
    if (recorder.state.phase !== "recording") return;
    const startedAt = recorder.state.startedAt;
    const timer = window.setInterval(() => setRecordedFor((performance.now() - startedAt) / 1000), 200);
    return () => {
      window.clearInterval(timer);
      setRecordedFor(0);
    };
  }, [recorder.state]);

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

  /** Adds text at the playhead, in a style if one is given. */
  function addTextWith(style?: TextStyle) {
    if (!frame) return;
    const at = useTransportStore.getState().time;
    if (!put((p) => addText(p, frame, at, { style }))) say("Couldn't add that to the video.");
    else say(null);
  }

  /** A style tile: restyles the selected text, or adds new text in that style. */
  function pickTextStyle(style: TextStyle) {
    const clip = selectedClip;
    if (clip?.kind === "text" && frame) {
      useClipProjectStore.getState().apply((p) => applyTextStyle(p, clip.id, style, frame));
    } else {
      addTextWith(style);
    }
  }

  /** A caption at the bottom that lasts as long as the selected photo or video. */
  function addCaption() {
    const clip = selectedClip;
    if (!clip || !frame) return;
    let made = false;
    const added = put((p) => {
      const result = addCaptionFor(p, clip.id, frame);
      made = result !== null;
      return result ?? { project: p, clipId: "" };
    });
    if (made && added) say(null);
    else say("Couldn't add a caption to that.");
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
      saveFrame(restoredFrame);
    }
  }

  /** A new shape from the toolbar or the project panel: pictures and text move with it. */
  function changeFrame(preset: { width: number; height: number }) {
    if (frame && (frame.width !== preset.width || frame.height !== preset.height)) {
      const from = frame;
      const store = useClipProjectStore.getState();
      const before = store.history.present;
      store.apply((current) => refitToFrame(current, from, preset));
      // Undo and redo of this step bring the shape back with the layout.
      frameFor.current.set(before, from);
      frameFor.current.set(useClipProjectStore.getState().history.present, preset);
    }
    saveFrame(preset);
  }

  function saveFrame(preset: { width: number; height: number }) {
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
    ? ["media", "audio", "text", "filters", "transitions", "edit"]
    : ["media", "audio", "text", "filters", "transitions"];
  const shownTab: Tab = tabNames.includes(tab) ? tab : "media";

  const details = selectedClip ? (
    <EditTab clip={selectedClip} frame={frame} />
  ) : (
    <ProjectPanel frame={frame} duration={duration} clipCount={project.clips.length} onFrameChange={changeFrame} />
  );

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
          onMakeVideo={(items) => {
            void makeVideo(items);
            setToolsOpen(false);
          }}
          onAddMany={(items) => {
            void addMany(items);
            setToolsOpen(false);
          }}
          onUpload={env.uploadFiles}
          onRetryUpload={env.retryUpload}
          onRemoveUpload={env.removeUpload}
          openPickerRef={openPickerRef}
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
      ) : shownTab === "text" ? (
        <TextTab
          selectedIsText={selectedClip?.kind === "text"}
          canCaption={selectedClip?.kind === "image" || selectedClip?.kind === "video"}
          onAddText={() => addTextWith()}
          onPickStyle={pickTextStyle}
          onAddCaption={addCaption}
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
        details
      )}
    </>
  );

  // The start card: while the video is empty, choose photos, then make the video in one tap.
  const pictures = env.library.filter((item) => item.type !== "audio" && item.status !== "error");
  // In the order they were picked (the library lists newest first, which would turn the video around).
  const justPicked = startPick?.ids
    ? Array.from(startPick.ids).flatMap((id) => pictures.filter((item) => item.id === id))
    : startPick?.before
      ? pictures.filter((item) => !startPick.before!.has(item.id))
      : [];
  const justReady = justPicked.filter(isUsable);
  const showStart = !!env.uploadFiles && !hasClips && !startDismissed;
  const openPanel = (name: Tab) => {
    setTab(name);
    if (compact) setToolsOpen(true);
  };
  const startCard = showStart ? (
    <StartCard
      picked={justPicked.length}
      ready={justReady.length}
      hasLibrary={pictures.some(isUsable)}
      onChoose={() => startPicker.current?.click()}
      onMakeVideo={() => {
        finishStartPick();
        void makeVideo(justReady);
      }}
      onArrangeMyself={() => {
        finishStartPick();
        void addMany(justReady);
      }}
      onUseLibrary={() => {
        setStartDismissed(true);
        openPanel("media");
      }}
    />
  ) : null;

  return (
    <div className="flex h-full flex-col">
      {env.uploadFiles && (
        <input
          ref={startPicker}
          type="file"
          multiple
          accept="image/*,video/*"
          aria-label="Choose photos and videos"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length === 0) return;
            const before = new Set(env.library.map((item) => item.id));
            const ids = env.uploadFiles?.(files);
            // Picking more adds to what is already picked.
            setStartPick((current) =>
              Array.isArray(ids)
                ? { ids: new Set([...(current?.ids ?? []), ...ids]) }
                : { before: current?.before ?? before },
            );
          }}
        />
      )}
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
          <SheetContent side="bottom" className="gap-0 p-0 pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[70svh]">
            <SheetHeader className="sr-only">
              <SheetTitle>Tools</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col [&>[role=tablist]]:pr-11" onClickCapture={blurOnMouseClick}>
              {panels}
            </div>
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
          <aside className="flex w-72 shrink-0 flex-col border-r" onClickCapture={blurOnMouseClick}>
            {panels}
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <StudioPreview containerRef={containerRef} wrapperRef={previewRef}>
            {startCard}
          </StudioPreview>
          {compact && (
            // A phone's tool bar: every panel one tap away, with a word under each icon.
            <nav aria-label="Tools" className="order-last grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)]" onClickCapture={blurOnMouseClick}>
              {(
                [
                  { name: "media", label: "Add", icon: Plus, tour: "tools-button" },
                  { name: "audio", label: "Music", icon: Music },
                  { name: "text", label: "Text", icon: Type },
                  { name: "filters", label: "Filters", icon: Palette },
                  { name: "edit", label: "Edit", icon: SlidersHorizontal, needsClip: true },
                ] as const
              ).map((item) => (
                <button
                  key={item.name}
                  type="button"
                  data-tour={"tour" in item ? item.tour : undefined}
                  aria-label={item.name === "edit" ? "Edit selected" : undefined}
                  disabled={"needsClip" in item && !selectedClip}
                  onClick={() => openPanel(item.name)}
                  className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <item.icon className="size-5" aria-hidden />
                  {item.label}
                </button>
              ))}
            </nav>
          )}
          <div onClickCapture={blurOnMouseClick}>
            <PreviewControls
              time={time}
              duration={duration}
              playing={playing}
              onToggle={() => session?.toggle()}
              onSeek={(t) => session?.seek(t)}
              onFullscreen={() => void previewRef.current?.requestFullscreen?.()}
              voiceover={
                env.uploadFiles
                  ? {
                      recording: recorder.state.phase === "recording",
                      busy: recorder.state.phase === "starting" || savingTake,
                      elapsed: recordedFor,
                      onToggle: () => void toggleVoiceover(),
                    }
                  : undefined
              }
            />
          </div>
          <UploadStatusBar
            library={env.library}
            onShowUploads={() => openPanel("media")}
            onRetryAll={
              env.retryUpload
                ? () => {
                    for (const item of env.library) if (item.status === "error" && item.retryable) env.retryUpload?.(item.id);
                  }
                : undefined
            }
          />
          {failedUploads.length > 0 && (
            <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
              {failedUploads.map((item) => item.name).join(", ")} did not upload, so {failedUploads.length === 1 ? "it" : "they"} will be missing the next time you open this video. Import {failedUploads.length === 1 ? "it" : "them"} again.
            </p>
          )}
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={"border-t px-3 py-2 text-xs " + (message.tone === "error" ? "text-destructive" : "text-muted-foreground")}
            >
              {message.text}
            </p>
          )}
          <ClipTools />
          <div data-tour="timeline" className="flex h-[40%] min-h-[200px] shrink-0 flex-col border-t p-2 lg:min-h-[260px]">
            <TimelineView
              fps={FPS}
              onSeek={(t) => session?.seek(t)}
              onToggle={() => session?.toggle()}
              onStep={(direction) => session?.step(direction, FPS)}
              visuals={visuals ?? undefined}
              onDropMedia={dropMedia}
              onOpenTransition={openTransition}
              onAddClip={() => {
                // With the photos and videos already in view, + means "bring in more": open the file picker.
                if (shownTab === "media" && (!compact || toolsOpen) && openPickerRef.current) {
                  openPickerRef.current();
                  return;
                }
                setTab("media");
                if (compact) setToolsOpen(true);
              }}
            />
          </div>
        </main>
        {!compact && (
          <aside className="flex w-72 shrink-0 flex-col border-l" aria-label="Details" onClickCapture={blurOnMouseClick}>
            {details}
          </aside>
        )}
      </div>
    </div>
  );
}
