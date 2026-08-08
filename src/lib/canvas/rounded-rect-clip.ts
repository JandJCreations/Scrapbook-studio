import type Konva from "konva";

export function roundedRectClip(
  ctx: Konva.Context,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(width - r, 0);
  ctx.arc(width - r, r, r, -Math.PI / 2, 0, false);
  ctx.lineTo(width, height - r);
  ctx.arc(width - r, height - r, r, 0, Math.PI / 2, false);
  ctx.lineTo(r, height);
  ctx.arc(r, height - r, r, Math.PI / 2, Math.PI, false);
  ctx.lineTo(0, r);
  ctx.arc(r, r, r, Math.PI, (Math.PI * 3) / 2, false);
  ctx.closePath();
}
