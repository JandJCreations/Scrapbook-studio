import { Line } from "react-konva";

import type { GuideLine } from "@/lib/canvas/alignment";

interface AlignmentGuidesLayerProps {
  guides: GuideLine[];
  viewport: { x: number; y: number; scale: number };
  width: number;
  height: number;
}

const GUIDE_COLOR = "#f43f5e";

export function AlignmentGuidesLayer({
  guides,
  viewport,
  width,
  height,
}: AlignmentGuidesLayerProps) {
  const worldLeft = -viewport.x / viewport.scale;
  const worldTop = -viewport.y / viewport.scale;
  const worldRight = worldLeft + width / viewport.scale;
  const worldBottom = worldTop + height / viewport.scale;

  return (
    <>
      {guides.map((guide, i) =>
        guide.axis === "x" ? (
          <Line
            key={`gx-${i}`}
            points={[guide.position, worldTop, guide.position, worldBottom]}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / viewport.scale}
            dash={[4 / viewport.scale, 4 / viewport.scale]}
            listening={false}
          />
        ) : (
          <Line
            key={`gy-${i}`}
            points={[worldLeft, guide.position, worldRight, guide.position]}
            stroke={GUIDE_COLOR}
            strokeWidth={1 / viewport.scale}
            dash={[4 / viewport.scale, 4 / viewport.scale]}
            listening={false}
          />
        ),
      )}
    </>
  );
}
