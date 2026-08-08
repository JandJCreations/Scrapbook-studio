import { Rect } from "react-konva";

export function CanvasFrameOutline({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="white"
        shadowColor="black"
        shadowBlur={20}
        shadowOpacity={0.15}
        listening={false}
      />
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={1}
        listening={false}
      />
    </>
  );
}
