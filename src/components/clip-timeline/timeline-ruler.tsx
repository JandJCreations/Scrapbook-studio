"use client";

import * as React from "react";

import { rulerTicks, timeToX } from "@/lib/timeline-ui/geometry";

interface TimelineRulerProps {
  pps: number;
  width: number;
  startTime: number;
  endTime: number;
  /** Playhead position and project length, for assistive technology. */
  time: number;
  duration: number;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerEnd: React.PointerEventHandler<HTMLDivElement>;
}

export const TimelineRuler = React.forwardRef<HTMLDivElement, TimelineRulerProps>(
  function TimelineRuler(
    { pps, width, startTime, endTime, time, duration, onPointerDown, onPointerMove, onPointerEnd },
    ref,
  ) {
    const ticks = React.useMemo(() => rulerTicks(pps, startTime, endTime), [pps, startTime, endTime]);
    return (
      <div
        ref={ref}
        role="slider"
        aria-label="Timeline ruler"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={time}
        className="relative cursor-pointer select-none border-b bg-card"
        style={{ width, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
      >
        {ticks.map((tick) => (
          <div
            key={tick.time}
            className="absolute bottom-0 border-l border-muted-foreground/50"
            style={{ left: timeToX(tick.time, pps), height: tick.major ? 14 : 7 }}
          >
            {tick.label && (
              <span className="absolute -top-3.5 left-1 whitespace-nowrap text-[10px] text-muted-foreground">
                {tick.label}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  },
);
