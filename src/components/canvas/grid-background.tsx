import { Group, Line } from "react-konva";

import { GRID_SIZE } from "@/lib/canvas/constants";

interface GridBackgroundProps {
  viewport: { x: number; y: number; scale: number };
  width: number;
  height: number;
}

const MINOR_COLOR = "rgba(128, 128, 128, 0.14)";
const MAJOR_COLOR = "rgba(128, 128, 128, 0.28)";
const MAJOR_EVERY = 5;

export function GridBackground({ viewport, width, height }: GridBackgroundProps) {
  if (width === 0 || height === 0) return null;

  const worldLeft = -viewport.x / viewport.scale;
  const worldTop = -viewport.y / viewport.scale;
  const worldRight = worldLeft + width / viewport.scale;
  const worldBottom = worldTop + height / viewport.scale;

  const startCol = Math.floor(worldLeft / GRID_SIZE);
  const endCol = Math.ceil(worldRight / GRID_SIZE);
  const startRow = Math.floor(worldTop / GRID_SIZE);
  const endRow = Math.ceil(worldBottom / GRID_SIZE);

  const verticalLines = [];
  for (let col = startCol; col <= endCol; col++) {
    const x = col * GRID_SIZE;
    verticalLines.push(
      <Line
        key={`v-${col}`}
        points={[x, worldTop, x, worldBottom]}
        stroke={col % MAJOR_EVERY === 0 ? MAJOR_COLOR : MINOR_COLOR}
        strokeWidth={1 / viewport.scale}
        listening={false}
      />,
    );
  }

  const horizontalLines = [];
  for (let row = startRow; row <= endRow; row++) {
    const y = row * GRID_SIZE;
    horizontalLines.push(
      <Line
        key={`h-${row}`}
        points={[worldLeft, y, worldRight, y]}
        stroke={row % MAJOR_EVERY === 0 ? MAJOR_COLOR : MINOR_COLOR}
        strokeWidth={1 / viewport.scale}
        listening={false}
      />,
    );
  }

  return (
    <Group listening={false}>
      {verticalLines}
      {horizontalLines}
    </Group>
  );
}
