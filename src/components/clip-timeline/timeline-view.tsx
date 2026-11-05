"use client";

import * as React from "react";

import { ClipChip } from "@/components/clip-timeline/clip-chip";
import { TimelineRuler } from "@/components/clip-timeline/timeline-ruler";
import { type MediaVisuals } from "@/components/clip-timeline/clip-visuals";
import { TrackHeader } from "@/components/clip-timeline/track-header";
import { deleteSelected, duplicateSelected, splitAtPlayhead } from "@/lib/timeline-ui/commands";
import {
  clipsInRect,
  computeMove,
  computeTrim,
  DRAG_THRESHOLD_PX,
  dropTargetAt,
  type Guide,
} from "@/lib/timeline-ui/drag";
import {
  timelineWidth,
  timeToX,
  wheelZoomFactor,
  ZOOM_DEFAULT,
  zoomAround,
} from "@/lib/timeline-ui/geometry";
import { commandForKey, nextSelection } from "@/lib/timeline-ui/interactions";
import { viewWindow } from "@/lib/timeline-ui/visuals";
import {
  clipRect,
  HEADER_WIDTH,
  pointerToTime,
  RULER_HEIGHT,
  scrollAfterTimeChange,
  trackLayout,
  type TrackLayout,
} from "@/lib/timeline-ui/layout";
import { timelineExtent } from "@/lib/timeline/clip-math";
import { createId, type IdFn } from "@/lib/timeline/ids";
import type { TrimEdge } from "@/lib/timeline/trim";
import {
  selectProject,
  selectSavableProject,
  useClipProjectStore,
} from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

interface TimelineViewProps {
  fps: number;
  onSeek(time: number): void;
  onToggle(): void;
  onStep(direction: 1 | -1): void;
  /** Thumbnails, pictures and waveforms for the chips; without it chips are plain. */
  visuals?: MediaVisuals;
}

interface PressInfo {
  /** The pointer that started the drag; events from any other pointer are ignored. */
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type Drag =
  | (PressInfo & {
      kind: "move";
      clipId: string;
      grabOffset: number;
      newTrackId: IdFn;
      /**
       * The rows as they were when the drag began. Drop targets are worked out
       * against this fixed layout: the preview itself adds and moves rows, and
       * measuring against that makes the target flip on every mouse move.
       */
      layout: TrackLayout;
    })
  | (PressInfo & { kind: "trim"; clipId: string; edge: TrimEdge })
  | (PressInfo & {
      kind: "marquee";
      additive: boolean;
      baseSelection: string[];
      origin: { x: number; y: number };
    });

interface Marquee {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isEditable(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return true;
  // A focused button handles Space itself; do not also toggle playback.
  return target.tagName === "BUTTON" && key === " ";
}

// Widgets that use the arrow keys, Space and Home/End themselves.
const WIDGET_SELECTOR =
  '[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],[role="slider"],[role="tab"],[role="dialog"],[aria-modal="true"]';

function insideWidget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(WIDGET_SELECTOR) !== null;
}

/** One new-track id for the whole drag, so a long drag creates a single track. */
function oncePerDrag(): IdFn {
  let id: string | undefined;
  return () => (id ??= createId());
}

export function TimelineView({ onSeek, onToggle, onStep, visuals }: TimelineViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rulerRef = React.useRef<HTMLDivElement>(null);
  const tracksRef = React.useRef<HTMLDivElement>(null);
  const scrubbing = React.useRef(false);
  const pendingScroll = React.useRef<number | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const listenersRef = React.useRef<{
    move: (event: PointerEvent) => void;
    end: () => void;
    cancel: () => void;
  } | null>(null);
  const suppressClick = React.useRef(false);

  const [pps, setPps] = React.useState(ZOOM_DEFAULT);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(800);
  const [guide, setGuide] = React.useState<Guide | null>(null);
  const [marquee, setMarquee] = React.useState<Marquee | null>(null);

  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);

  const duration = timelineExtent(project);
  const layout = React.useMemo(() => trackLayout(project), [project]);
  const laneWidth = timelineWidth(duration, pps, viewportWidth - HEADER_WIDTH);
  const rowByTrack = React.useMemo(
    () => new Map(layout.rows.map((row) => [row.trackId, row])),
    [layout],
  );
  const trackById = React.useMemo(
    () => new Map(project.tracks.map((track) => [track.id, track])),
    [project.tracks],
  );
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  // The zoom level lives in its own ref, written synchronously by the wheel
  // handler: a burst of pinch events arrives faster than React renders, and
  // each step must build on the one before it.
  const ppsRef = React.useRef(ZOOM_DEFAULT);
  const latest = React.useRef({ duration, onSeek, onToggle, onStep });
  React.useEffect(() => {
    latest.current = { duration, onSeek, onToggle, onStep };
  });

  // --- Drag lifecycle -----------------------------------------------------

  /** A pointer position in lane coordinates: x in pixels from time 0, y from the top of the tracks. */
  const lanePoint = React.useCallback((clientX: number, clientY: number) => {
    const ruler = rulerRef.current?.getBoundingClientRect();
    const tracks = tracksRef.current?.getBoundingClientRect();
    return { x: clientX - (ruler?.left ?? 0), y: clientY - (tracks?.top ?? 0) };
  }, []);

  const detach = React.useCallback(() => {
    const listeners = listenersRef.current;
    if (listeners) {
      window.removeEventListener("pointermove", listeners.move);
      window.removeEventListener("pointerup", listeners.end);
      window.removeEventListener("pointercancel", listeners.cancel);
      window.removeEventListener("blur", listeners.cancel);
    }
    listenersRef.current = null;
    dragRef.current = null;
  }, []);

  /** Abandons the drag in progress, if any. Returns whether there was one. */
  const cancelDrag = React.useCallback((): boolean => {
    const drag = dragRef.current;
    if (!drag) return false;
    detach();
    const store = useClipProjectStore.getState();
    if (drag.kind === "marquee") store.setSelectedClipIds(drag.baseSelection);
    else if (drag.moved) store.cancelGesture();
    setGuide(null);
    setMarquee(null);
    return true;
  }, [detach]);

  const onDragEnd = React.useCallback(
    (event?: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && event && event.pointerId !== drag.pointerId) return;
      detach();
      if (!drag) return;
      if (drag.kind !== "marquee" && drag.moved) useClipProjectStore.getState().endGesture();
      if (drag.moved) {
        // The browser sends a click after the pointer is released; ignore that one.
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      setGuide(null);
      setMarquee(null);
    },
    [detach],
  );

  const onDragMove = React.useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      // The button was released somewhere we never heard about (outside the
      // window, over a dialog): finish with what is on screen instead of
      // following a mouse that is no longer pressed.
      if (event.buttons === 0) {
        onDragEnd(event);
        return;
      }
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        drag.moved = true;
      }

      const store = useClipProjectStore.getState();
      const point = lanePoint(event.clientX, event.clientY);
      const zoom = ppsRef.current;
      const pointerTime = Math.max(0, point.x / zoom);
      const playhead = useTransportStore.getState().time;

      if (drag.kind === "marquee") {
        const shown = selectProject(store);
        const left = Math.min(drag.origin.x, point.x);
        const right = Math.max(drag.origin.x, point.x);
        const top = Math.min(drag.origin.y, point.y);
        const bottom = Math.max(drag.origin.y, point.y);
        const hits = clipsInRect(shown, trackLayout(shown), zoom, { left, top, right, bottom });
        store.setSelectedClipIds(
          drag.additive ? Array.from(new Set([...drag.baseSelection, ...hits])) : hits,
        );
        setMarquee({ left, top, width: right - left, height: bottom - top });
        return;
      }

      // Every preview is computed from the project as it was before the drag.
      const base = selectSavableProject(store);
      const result =
        drag.kind === "move"
          ? computeMove(base, {
              clipId: drag.clipId,
              pointerTime,
              grabOffset: drag.grabOffset,
              target: dropTargetAt(drag.layout, point.y),
              playhead,
              pps: zoom,
              newTrackId: drag.newTrackId,
            })
          : computeTrim(base, {
              clipId: drag.clipId,
              edge: drag.edge,
              pointerTime,
              playhead,
              pps: zoom,
            });
      store.previewApply(() => result.project);
      setGuide(result.guide);
    },
    [lanePoint, onDragEnd],
  );

  const begin = (drag: Drag, event: React.PointerEvent) => {
    dragRef.current = drag;
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      // Not every environment can capture; the window listeners still work.
    }
    listenersRef.current = { move: onDragMove, end: onDragEnd, cancel: cancelDrag as () => void };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", cancelDrag);
    // Losing focus (Alt+Tab, an OS dialog) can swallow the mouse release.
    window.addEventListener("blur", cancelDrag);
  };

  // Leaving the page mid-drag abandons it.
  React.useEffect(
    () => () => {
      cancelDrag();
    },
    [cancelDrag],
  );

  const onLanePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    const target = event.target as HTMLElement;
    const chipEl = target.closest<HTMLElement>("[data-clip-id]");
    const edgeEl = target.closest<HTMLElement>("[data-edge]");
    const store = useClipProjectStore.getState();
    const point = lanePoint(event.clientX, event.clientY);
    const press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    if (chipEl?.dataset.clipId) {
      const clipId = chipEl.dataset.clipId;
      const clip = selectProject(store).clips.find((c) => c.id === clipId);
      if (!clip) return;
      if (!additive && !store.selectedClipIds.includes(clipId)) store.setSelectedClipIds([clipId]);
      const edge = edgeEl?.dataset.edge;
      if (edge === "start" || edge === "end") {
        begin({ kind: "trim", clipId, edge, ...press }, event);
      } else {
        begin(
          {
            kind: "move",
            clipId,
            grabOffset: Math.max(0, point.x / ppsRef.current - clip.start),
            newTrackId: oncePerDrag(),
            layout: trackLayout(selectSavableProject(store)),
            ...press,
          },
          event,
        );
      }
      return;
    }

    begin(
      {
        kind: "marquee",
        additive,
        baseSelection: additive ? store.selectedClipIds : [],
        origin: point,
        ...press,
      },
      event,
    );
  };

  // --- Width, zoom, follow, keys ------------------------------------------

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setViewportWidth(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd + wheel zooms around the pointer. Registered by hand because a
  // React wheel handler is passive and cannot stop the browser's page zoom.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const anchorX = Math.max(0, event.clientX - rect.left - container.clientLeft - HEADER_WIDTH);
      const next = zoomAround(
        { pps: ppsRef.current, scrollLeft: pendingScroll.current ?? container.scrollLeft },
        wheelZoomFactor(event.deltaY, event.deltaMode),
        anchorX,
      );
      ppsRef.current = next.pps;
      pendingScroll.current = next.scrollLeft;
      setPps(next.pps);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Apply the scroll position that keeps the zoom anchor fixed, after the new width exists.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && pendingScroll.current !== null) {
      container.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [pps]);

  // Keep the playhead in view when it moves. Zooming must not do this: it
  // would pull the view away from the point the user is zooming around.
  const lastTime = React.useRef(time);
  React.useEffect(() => {
    if (lastTime.current === time) return;
    lastTime.current = time;
    const container = containerRef.current;
    if (!container) return;
    const next = scrollAfterTimeChange({
      scrubbing: scrubbing.current,
      scrollLeft: container.scrollLeft,
      viewportWidth: container.clientWidth - HEADER_WIDTH,
      playheadX: timeToX(time, ppsRef.current),
    });
    if (next !== container.scrollLeft) container.scrollLeft = next;
  }, [time]);

  // Transport, undo and edit keys.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        editable: isEditable(event.target, event.key),
        handled: event.defaultPrevented || insideWidget(event.target),
        repeat: event.repeat,
      });
      if (!command) return;
      event.preventDefault();
      const { duration: total, onSeek: seek, onToggle: toggle, onStep: step } = latest.current;
      const store = useClipProjectStore.getState();
      const ids = store.selectedClipIds;
      switch (command.type) {
        case "toggle-play":
          toggle();
          break;
        case "step":
          step(command.direction);
          break;
        case "seek-start":
          seek(0);
          break;
        case "seek-end":
          seek(total);
          break;
        case "undo":
          store.undo();
          break;
        case "redo":
          store.redo();
          break;
        case "split":
          store.apply((p) => splitAtPlayhead(p, ids, useTransportStore.getState().time));
          break;
        case "delete":
          store.apply((p) => deleteSelected(p, ids, false));
          break;
        case "ripple-delete":
          store.apply((p) => deleteSelected(p, ids, true));
          break;
        case "duplicate":
          store.apply((p) => duplicateSelected(p, ids));
          break;
        case "cancel":
          // Escape first abandons a drag; only then does it clear the selection.
          if (!cancelDrag()) store.setSelectedClipIds([]);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrag]);

  const seekFromPointer = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const t = pointerToTime(clientX, ruler.getBoundingClientRect().left, ppsRef.current);
    latest.current.onSeek(Math.min(t, latest.current.duration));
  };

  const onRulerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = true;
    seekFromPointer(event.clientX);
  };
  const onRulerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (scrubbing.current) seekFromPointer(event.clientX);
  };
  const onRulerEnd: React.PointerEventHandler<HTMLDivElement> = (event) => {
    scrubbing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // One handler for all lanes: a click on a chip selects it, a click on empty space clears.
  const onLaneClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const chipEl = (event.target as HTMLElement).closest<HTMLElement>("[data-clip-id]");
    const store = useClipProjectStore.getState();
    if (!chipEl?.dataset.clipId) {
      if (!(event.shiftKey || event.ctrlKey || event.metaKey)) store.setSelectedClipIds([]);
      return;
    }
    store.setSelectedClipIds(
      nextSelection(store.selectedClipIds, chipEl.dataset.clipId, {
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
      }),
    );
  };

  const visibleRange = viewWindow(scrollLeft, viewportWidth);
  const startTime = scrollLeft / pps;
  const endTime = (scrollLeft + viewportWidth) / pps;
  const totalHeight = RULER_HEIGHT + layout.height;

  return (
    <div
      ref={containerRef}
      data-testid="clip-timeline"
      className="relative max-h-80 overflow-auto rounded-md border bg-card"
      onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
    >
      <div className="relative" style={{ width: HEADER_WIDTH + laneWidth, height: totalHeight }}>
        <div className="sticky top-0 z-30 flex" style={{ height: RULER_HEIGHT }}>
          <div
            className="sticky left-0 z-40 shrink-0 border-b border-r bg-card"
            style={{ width: HEADER_WIDTH }}
          />
          <TimelineRuler
            ref={rulerRef}
            pps={pps}
            width={laneWidth}
            startTime={startTime}
            endTime={endTime}
            time={time}
            duration={duration}
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerEnd={onRulerEnd}
          />
        </div>

        <div
          ref={tracksRef}
          data-testid="timeline-tracks"
          className="relative"
          style={{ height: layout.height }}
        >
          {project.tracks.map((track) => {
            const row = rowByTrack.get(track.id);
            if (!row) return null;
            return (
              <div
                key={track.id}
                className="absolute left-0 right-0 flex"
                style={{ top: row.y, height: row.height }}
              >
                <div
                  className="sticky left-0 z-40 shrink-0 border-b border-r bg-card"
                  style={{ width: HEADER_WIDTH }}
                >
                  <TrackHeader track={track} />
                </div>
                <div
                  data-track-id={track.id}
                  className="relative border-b bg-muted/30"
                  style={{ width: laneWidth, touchAction: "none" }}
                  onPointerDown={onLanePointerDown}
                  onClick={onLaneClick}
                >
                  {project.clips
                    .filter((clip) => clip.trackId === track.id)
                    .map((clip) => (
                      <ClipChip
                        key={clip.id}
                        clip={clip}
                        rect={clipRect(clip, { ...row, y: 0 }, pps)}
                        selected={selectedSet.has(clip.id)}
                        dimmed={trackById.get(clip.trackId)?.hidden ?? false}
                        visuals={visuals}
                        pps={pps}
                        viewFrom={visibleRange.from}
                        viewTo={visibleRange.to}
                      />
                    ))}
                </div>
              </div>
            );
          })}

          {guide && (
            <div
              data-testid="timeline-guide"
              className={`pointer-events-none absolute top-0 z-20 w-px ${
                guide.kind === "snap" ? "bg-yellow-400" : "bg-blue-500"
              }`}
              style={{ left: HEADER_WIDTH + timeToX(guide.time, pps), height: layout.height }}
            />
          )}
          {marquee && (
            <div
              data-testid="timeline-marquee"
              className="pointer-events-none absolute z-20 border border-sky-400 bg-sky-400/20"
              style={{
                left: HEADER_WIDTH + marquee.left,
                top: marquee.top,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
        </div>

        <div
          data-testid="playhead"
          className="pointer-events-none absolute top-0 z-30 w-px bg-red-500"
          style={{ left: HEADER_WIDTH + timeToX(time, pps), height: totalHeight }}
        >
          <div className="absolute -left-1 top-0 size-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-red-500" />
        </div>
      </div>
    </div>
  );
}
