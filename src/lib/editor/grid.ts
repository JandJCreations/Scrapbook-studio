/** One grid cell, in frame pixels: a twelfth of the shorter side, so cells are square at every frame size. */
export function gridSize(frame: { width: number; height: number }): number {
  return Math.max(1, Math.round(Math.min(frame.width, frame.height) / 12));
}

/** Positions of the grid lines strictly inside the frame. */
export function gridLines(
  frame: { width: number; height: number },
  size: number,
): { vertical: number[]; horizontal: number[] } {
  const along = (length: number) => {
    const lines: number[] = [];
    for (let at = size; at < length; at += size) lines.push(at);
    return lines;
  };
  return { vertical: along(frame.width), horizontal: along(frame.height) };
}
