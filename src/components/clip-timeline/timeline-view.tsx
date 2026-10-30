"use client";

import * as React from "react";

import { ClipChip } from "@/components/clip-timeline/clip-chip";
import { TimelineRuler } from "@/components/clip-timeline/timeline-ruler";
import { TrackHeader } from "@/components/clip-timeline/track-header";
import {
  timelineWidth,
  timeToX,
  ZOOM_DEFAULT,
  zoomAround,
} from "@/lib/timeline-ui/geometry";
import { commandForKey, nextSelection } from "@/lib/timeline-ui/interactions";
import {
  clipRect,
  HEADER_WIDTH,
  keepPlayheadVisible,
  pointerToTime,
  RULER_HEIGHT,
  trackLayout,
} from "@/lib/timeline-ui/layout";
import { projectDuration } from "@/lib/timeline/clip-math";
import { selectProject, useClipProjectStore } from "@/store/use-clip-project-store";
import { useTransportStore } from "@/store/use-transport-store";

interface TimelineViewProps {
  fps: number;
  onSeek(time: number): void;
  onToggle(): void;
  onStep(direction: 1 | -1): void;
}

function isEditable(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return true;
  // A focused button handles Space itself; do not also toggle playback.
  return target.tagName === "BUTTON" && key === " ";
}

export function TimelineView({ onSeek, onToggle, onStep }: TimelineViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rulerRef = React.useRef<HTMLDivElement>(null);
  const scrubbing = React.useRef(false);
  const pendingScroll = React.useRef<number | null>(null);

  const [pps, setPps] = React.useState(ZOOM_DEFAULT);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(800);

  const project = useClipProjectStore(selectProject);
  const selectedIds = useClipProjectStore((s) => s.selectedClipIds);
  const time = useTransportStore((s) => s.time);

  const duration = projectDuration(project);
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

  // The latest values for listeners that are registered once.
  const latest = React.useRef({ pps, duration, onSeek, onToggle, onStep });
  React.useEffect(() => {
    latest.current = { pps, duration, onSeek, onToggle, onStep };
  });

  // Track the visible width.
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
      const anchorX = Math.max(0, event.clientX - rect.left - HEADER_WIDTH);
      const factor = Math.exp(-event.deltaY * 0.01);
      const next = zoomAround(
        { pps: latest.current.pps, scrollLeft: container.scrollLeft },
        factor,
        anchorX,
      );
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

  // Keep the playhead in view.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = keepPlayheadVisible({
      scrollLeft: container.scrollLeft,
      viewportWidth: container.clientWidth - HEADER_WIDTH,
      playheadX: timeToX(time, pps),
    });
    if (next !== container.scrollLeft) container.scrollLeft = next;
  }, [time, pps]);

  // Transport and undo keys.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = commandForKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        editable: isEditable(event.target, event.key),
      });
      if (!command) return;
      event.preventDefault();
      const { duration: total, onSeek: seek, onToggle: toggle, onStep: step } = latest.current;
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
          useClipProjectStore.getState().undo();
          break;
        case "redo":
          useClipProjectStore.getState().redo();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const seekFromPointer = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const t = pointerToTime(clientX, ruler.getBoundingClientRect().left, latest.current.pps);
    latest.current.onSeek(Math.min(t, latest.current.duration));
  };

  const onRulerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
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
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-clip-id]");
    const store = useClipProjectStore.getState();
    if (!chip?.dataset.clipId) {
      store.setSelectedClipIds([]);
      return;
    }
    store.setSelectedClipIds(
      nextSelection(store.selectedClipIds, chip.dataset.clipId, {
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
      }),
    );
  };

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

        <div className="relative" style={{ height: layout.height }}>
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
                  style={{ width: laneWidth }}
                  onClick={onLaneClick}
                >
                  {project.clips
                    .filter((clip) => clip.trackId === track.id)
                    .map((clip) => {
                      const rect = clipRect(clip, { ...row, y: 0 }, pps);
                      return (
                        <ClipChip
                          key={clip.id}
                          clip={clip}
                          rect={rect}
                          selected={selectedSet.has(clip.id)}
                          dimmed={trackById.get(clip.trackId)?.hidden ?? false}
                        />
                      );
                    })}
                </div>
              </div>
            );
          })}
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
