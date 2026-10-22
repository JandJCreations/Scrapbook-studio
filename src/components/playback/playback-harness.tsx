"use client";

import * as React from "react";

import { createScenePainter } from "@/components/playback/scene-painter";
import { Button } from "@/components/ui/button";
import type { SlotState } from "@/lib/engine/slots";
import { getFfmpeg } from "@/lib/export/ffmpeg-client";
import {
  browserNow,
  browserSchedule,
  createBrowserAudioContext,
  createBrowserElement,
  readMediaInfo,
} from "@/lib/playback/browser";
import { addMediaToProject, HARNESS_FRAME, type MediaItem } from "@/lib/playback/harness-ops";
import { createImageCache } from "@/lib/playback/image-cache";
import type { PoolProblem } from "@/lib/playback/media-pool";
import { createObjectUrlRegistry } from "@/lib/playback/object-url-registry";
import { generateSampleClip, SAMPLE_CLIPS } from "@/lib/playback/sample-clips";
import { buildScene } from "@/lib/playback/scene";
import { createPlaybackSession, type PlaybackSession } from "@/lib/playback/session";
import { emptyTimeline } from "@/lib/sync/timeline-document";
import { setSpeed, updateClip } from "@/lib/timeline/clip-edits";
import { projectDuration } from "@/lib/timeline/clip-math";
import { deleteClips } from "@/lib/timeline/delete";
import { createId } from "@/lib/timeline/ids";
import { splitClip } from "@/lib/timeline/split";
import { updateTrack } from "@/lib/timeline/tracks";
import {
  selectCanRedo,
  selectCanUndo,
  selectProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";
import type { TimelineProject } from "@/types/timeline";

const FPS = 30;
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8];
const PROJECT_ID = "playback-harness";

interface ElementStats {
  created: number;
  loads: number;
  seeks: number;
}

interface DebugSnapshot {
  slots: SlotState[];
  problems: PoolProblem[];
  stats: ElementStats;
  nodes: number;
  level: number;
  audio: string;
}

interface HarnessDebug {
  session: PlaybackSession;
  stats: ElementStats;
  level: () => number;
  audioState: () => string;
  getProject: () => TimelineProject;
}

declare global {
  interface Window {
    __playbackHarness?: HarnessDebug;
  }
}

/** Counts creations, loads (src assignments) and seeks (currentTime assignments). */
function instrument(element: HTMLMediaElement, stats: ElementStats): HTMLMediaElement {
  stats.created += 1;
  const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
  const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  const getTime = time?.get;
  const setTime = time?.set;
  const getSrc = src?.get;
  const setSrc = src?.set;
  if (getTime && setTime) {
    Object.defineProperty(element, "currentTime", {
      configurable: true,
      get: () => getTime.call(element) as number,
      set: (value: number) => {
        stats.seeks += 1;
        setTime.call(element, value);
      },
    });
  }
  if (getSrc && setSrc) {
    Object.defineProperty(element, "src", {
      configurable: true,
      get: () => getSrc.call(element) as string,
      set: (value: string) => {
        stats.loads += 1;
        setSrc.call(element, value);
      },
    });
  }
  return element;
}

function kindOf(file: Blob): MediaItem["kind"] | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function PlaybackHarness() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const sessionRef = React.useRef<PlaybackSession | null>(null);
  const statsRef = React.useRef<ElementStats>({ created: 0, loads: 0, seeks: 0 });
  const [registry] = React.useState(() => createObjectUrlRegistry());
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [urlText, setUrlText] = React.useState("");
  const [urlKind, setUrlKind] = React.useState<MediaItem["kind"]>("video");
  const [debug, setDebug] = React.useState<DebugSnapshot | null>(null);

  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const canUndo = useClipProjectStore(selectCanUndo);
  const canRedo = useClipProjectStore(selectCanRedo);
  const time = useTransportStore((s) => s.time);
  const playing = useTransportStore((s) => s.playing);

  const duration = projectDuration(project);
  const selected = project.clips.find((clip) => clip.id === selectedIds[0]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    useClipProjectStore.getState().load(emptyTimeline(PROJECT_ID));
    useTransportStore.getState().reset();
    const stats = statsRef.current;
    stats.created = 0;
    stats.loads = 0;
    stats.seeks = 0;

    const audioContext = createBrowserAudioContext();
    const imageCache = createImageCache({
      urlFor: (mediaId) => registry.urlFor(mediaId),
      onLoad: () => sessionRef.current?.wake(),
      createImage: () => new Image(),
    });
    const painter = createScenePainter({
      container,
      frame: HARNESS_FRAME,
      getImage: (mediaId) => imageCache.get(mediaId),
    });
    const getProject = () => selectProject(useClipProjectStore.getState());

    const session = createPlaybackSession({
      getProject,
      audioContext,
      createElement: (kind) => instrument(createBrowserElement(kind), stats),
      urlFor: (mediaId) => registry.urlFor(mediaId),
      now: browserNow,
      schedule: browserSchedule,
      onFrame: (frame, pool) => {
        useTransportStore.getState().setFrame(frame.time, frame.playing);
        painter.render(buildScene(getProject(), frame.time, (clipId) => pool.elementForClip(clipId)));
      },
      onDispose: () => {
        imageCache.dispose();
        registry.revokeAll();
      },
    });
    sessionRef.current = session;

    // Tap the master output so the page (and Chrome) can see whether sound is flowing.
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    session.graph.master.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const level = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      return Math.sqrt(sum / samples.length);
    };

    const snapshot = (): DebugSnapshot => ({
      slots: session.pool.slots(),
      problems: session.problems(),
      stats: { ...stats },
      nodes: painter.nodeCount(),
      level: level(),
      audio: audioContext.state,
    });
    const poll = window.setInterval(() => setDebug(snapshot()), 250);

    const resize = () => painter.resize(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // Any edit (including loading) re-plans and redraws once.
    const unsubscribe = useClipProjectStore.subscribe(() => session.wake());

    window.__playbackHarness = {
      session,
      stats,
      level,
      audioState: () => audioContext.state,
      getProject,
    };
    session.wake();

    return () => {
      window.clearInterval(poll);
      unsubscribe();
      observer.disconnect();
      delete window.__playbackHarness;
      sessionRef.current = null;
      painter.destroy();
      void session.dispose();
    };
  }, [registry]);

  async function finishAdd(mediaId: string, name: string, kind: MediaItem["kind"], url: string) {
    try {
      const info = await readMediaInfo(url, kind);
      useClipProjectStore.getState().apply((p) => addMediaToProject(p, { mediaId, name, kind, ...info }));
      setMessage(null);
    } catch (error) {
      registry.remove(mediaId);
      setMessage(error instanceof Error ? error.message : "Could not add that file.");
    }
  }

  async function addBlob(blob: Blob, name: string, kind: MediaItem["kind"]) {
    const mediaId = createId();
    await finishAdd(mediaId, name, kind, registry.addBlob(mediaId, blob));
  }

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) {
        setMessage(`Unsupported file type: ${file.type || file.name}`);
        continue;
      }
      await addBlob(file, file.name, kind);
    }
  }

  async function addRemote() {
    const url = urlText.trim();
    if (!url) return;
    const mediaId = createId();
    registry.addUrl(mediaId, url);
    await finishAdd(mediaId, url.split("/").pop() || url, urlKind, url);
  }

  async function generateSamples() {
    setBusy(true);
    try {
      setMessage("Loading FFmpeg (one-time download of about 30 MB)…");
      const ffmpeg = await getFfmpeg();
      for (const spec of SAMPLE_CLIPS) {
        setMessage(`Generating ${spec.name}…`);
        await addBlob(await generateSampleClip(ffmpeg, spec), spec.name, "video");
      }
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the sample clips.");
    } finally {
      setBusy(false);
    }
  }

  const apply = useClipProjectStore.getState().apply;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 text-sm">
      <h1 className="text-lg font-semibold">Playback test page</h1>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-3">
          <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-md bg-black" />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => sessionRef.current?.toggle()}>{playing ? "Pause" : "Play"}</Button>
            <Button variant="secondary" onClick={() => sessionRef.current?.step(-1, FPS)}>
              ◀ Frame
            </Button>
            <Button variant="secondary" onClick={() => sessionRef.current?.step(1, FPS)}>
              Frame ▶
            </Button>
            <span className="tabular-nums" data-testid="time">
              {time.toFixed(3)} / {duration.toFixed(3)} s
            </span>
            <Button variant="ghost" disabled={!canUndo} onClick={() => useClipProjectStore.getState().undo()}>
              Undo
            </Button>
            <Button variant="ghost" disabled={!canRedo} onClick={() => useClipProjectStore.getState().redo()}>
              Redo
            </Button>
          </div>

          <input
            type="range"
            aria-label="Scrub"
            min={0}
            max={duration || 1}
            step={0.001}
            value={Math.min(time, duration || 1)}
            onChange={(event) => sessionRef.current?.seek(Number(event.target.value))}
          />

          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <label className="flex items-center gap-2">
              Add files
              <input type="file" multiple accept="video/*,audio/*,image/*" onChange={onFiles} />
            </label>
            <Button disabled={busy} variant="secondary" onClick={generateSamples}>
              Generate sample clips
            </Button>
            <div className="flex items-center gap-2">
              <input
                className="w-64 rounded border px-2 py-1"
                placeholder="https://… (video, audio or image)"
                value={urlText}
                onChange={(event) => setUrlText(event.target.value)}
              />
              <select
                className="rounded border px-1 py-1"
                value={urlKind}
                onChange={(event) => setUrlKind(event.target.value as MediaItem["kind"])}
              >
                <option value="video">video</option>
                <option value="audio">audio</option>
                <option value="image">image</option>
              </select>
              <Button variant="secondary" onClick={addRemote}>
                Add from URL
              </Button>
            </div>
            {message && (
              <p role="status" className="w-full text-amber-600" data-testid="message">
                {message}
              </p>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-md border p-3">
            <h2 className="mb-2 font-medium">Clips</h2>
            <ul className="flex flex-col gap-1">
              {project.clips.map((clip) => (
                <li key={clip.id}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left ${
                      selectedIds.includes(clip.id) ? "bg-primary/15" : "hover:bg-muted"
                    }`}
                    onClick={() => useClipProjectStore.getState().setSelectedClipIds([clip.id])}
                  >
                    {clip.name} · {clip.kind} · {clip.start.toFixed(2)}s
                    {clip.reversed ? " · reversed" : ""}
                    {clip.speed !== 1 ? ` · ${clip.speed}x` : ""}
                  </button>
                </li>
              ))}
              {project.clips.length === 0 && <li className="text-muted-foreground">No clips yet.</li>}
            </ul>

            {selected && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => apply((p) => splitClip(p, selected.id, time))}>
                  Split at playhead
                </Button>
                <Button size="sm" variant="secondary" onClick={() => apply((p) => deleteClips(p, selectedIds))}>
                  Delete
                </Button>
                <label className="flex items-center gap-1">
                  Speed
                  <select
                    className="rounded border px-1 py-0.5"
                    value={selected.speed}
                    onChange={(event) => apply((p) => setSpeed(p, selected.id, Number(event.target.value)))}
                  >
                    {SPEEDS.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}x
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selected.reversed}
                    onChange={() => apply((p) => updateClip(p, selected.id, { reversed: !selected.reversed }))}
                  />
                  Reverse
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selected.muted}
                    onChange={() => apply((p) => updateClip(p, selected.id, { muted: !selected.muted }))}
                  />
                  Mute clip
                </label>
                <label className="flex w-full items-center gap-2">
                  Volume {selected.volume}%
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={selected.volume}
                    onChange={(event) =>
                      apply((p) => updateClip(p, selected.id, { volume: Number(event.target.value) }))
                    }
                  />
                </label>
              </div>
            )}
          </section>

          <section className="rounded-md border p-3">
            <h2 className="mb-2 font-medium">Tracks</h2>
            <ul className="flex flex-col gap-1">
              {project.tracks.map((track) => (
                <li key={track.id} className="flex items-center gap-3">
                  <span className="w-16">{track.type}</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={track.muted}
                      onChange={() => apply((p) => updateTrack(p, track.id, { muted: !track.muted }))}
                    />
                    mute
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={track.hidden}
                      onChange={() => apply((p) => updateTrack(p, track.id, { hidden: !track.hidden }))}
                    />
                    hide
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border p-3" data-testid="debug">
            <h2 className="mb-2 font-medium">Debug</h2>
            {debug ? (
              <div className="flex flex-col gap-1 font-mono text-xs">
                <div>
                  elements created {debug.stats.created} · loads {debug.stats.loads} · seeks {debug.stats.seeks}
                </div>
                <div>
                  painter nodes {debug.nodes} · audio {debug.audio} · level {debug.level.toFixed(4)}
                </div>
                {debug.slots.map((slot) => (
                  <div key={slot.id}>
                    {slot.id} {slot.kind} file {slot.mediaId?.slice(0, 8) ?? "–"} clip{" "}
                    {slot.clipId?.slice(0, 8) ?? "–"} t {slot.currentTime.toFixed(3)}
                  </div>
                ))}
                {debug.problems.map((problem, index) => (
                  <div key={index} className="text-red-600">
                    problem: {problem.kind} (clip {problem.clipId.slice(0, 8)})
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Starting…</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
