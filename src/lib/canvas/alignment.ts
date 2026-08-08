export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuideLine {
  axis: "x" | "y";
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

function edgesFor(box: Pick<Box, "x" | "y" | "width" | "height">) {
  return {
    x: [box.x, box.x + box.width / 2, box.x + box.width],
    y: [box.y, box.y + box.height / 2, box.y + box.height],
  };
}

export function computeSnap(
  moving: Box,
  others: Box[],
  threshold: number,
): SnapResult {
  const movingEdges = edgesFor(moving);
  const guides: GuideLine[] = [];
  let bestDx: number | null = null;
  let bestDy: number | null = null;

  for (const other of others) {
    if (other.id === moving.id) continue;
    const otherEdges = edgesFor(other);

    for (const mx of movingEdges.x) {
      for (const ox of otherEdges.x) {
        const dx = ox - mx;
        if (Math.abs(dx) <= threshold) {
          if (bestDx === null || Math.abs(dx) < Math.abs(bestDx)) {
            bestDx = dx;
          }
        }
      }
    }

    for (const my of movingEdges.y) {
      for (const oy of otherEdges.y) {
        const dy = oy - my;
        if (Math.abs(dy) <= threshold) {
          if (bestDy === null || Math.abs(dy) < Math.abs(bestDy)) {
            bestDy = dy;
          }
        }
      }
    }
  }

  const snappedX = bestDx !== null ? moving.x + bestDx : moving.x;
  const snappedY = bestDy !== null ? moving.y + bestDy : moving.y;

  if (bestDx !== null) {
    const snappedEdges = edgesFor({ ...moving, x: snappedX });
    for (const other of others) {
      if (other.id === moving.id) continue;
      const otherEdges = edgesFor(other);
      for (const mx of snappedEdges.x) {
        if (otherEdges.x.some((ox) => Math.abs(ox - mx) < 0.5)) {
          guides.push({ axis: "x", position: mx });
        }
      }
    }
  }

  if (bestDy !== null) {
    const snappedEdges = edgesFor({ ...moving, y: snappedY });
    for (const other of others) {
      if (other.id === moving.id) continue;
      const otherEdges = edgesFor(other);
      for (const my of snappedEdges.y) {
        if (otherEdges.y.some((oy) => Math.abs(oy - my) < 0.5)) {
          guides.push({ axis: "y", position: my });
        }
      }
    }
  }

  return { x: snappedX, y: snappedY, guides };
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
