import { formatDuration } from "@/lib/media/format";

interface TimelineRulerProps {
  pixelsPerSecond: number;
  width: number;
}

function pickStep(pixelsPerSecond: number) {
  const candidates = [1, 2, 5, 10, 15, 30, 60];
  for (const step of candidates) {
    if (step * pixelsPerSecond >= 60) return step;
  }
  return 120;
}

export function TimelineRuler({ pixelsPerSecond, width }: TimelineRulerProps) {
  const step = pickStep(pixelsPerSecond);
  const count = Math.ceil(width / (step * pixelsPerSecond)) + 1;
  const marks = Array.from({ length: count }, (_, i) => i * step);

  return (
    <div
      className="relative h-6 border-b border-border bg-background"
      style={{ width }}
    >
      {marks.map((seconds) => (
        <div
          key={seconds}
          className="absolute top-0 flex h-full flex-col justify-end border-l border-border/60 pl-1"
          style={{ left: seconds * pixelsPerSecond }}
        >
          <span className="pb-0.5 text-[10px] text-muted-foreground">
            {formatDuration(seconds)}
          </span>
        </div>
      ))}
    </div>
  );
}
