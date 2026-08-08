export interface CurvedChar {
  char: string;
  x: number;
  y: number;
  rotation: number;
}

let measureCanvas: HTMLCanvasElement | null = null;

function measureCharWidth(
  char: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
) {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return fontSize * 0.6;
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
  return ctx.measureText(char).width;
}

/**
 * Lays characters out along a circular arc. `curve` ranges -100..100;
 * larger magnitude = tighter curve, sign flips the arc direction.
 */
export function layoutCurvedText(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacing: number,
  curve: number,
): CurvedChar[] {
  if (curve === 0 || text.length === 0) return [];

  const radius = Math.max(60, 4000 / Math.abs(curve));
  const direction = curve > 0 ? 1 : -1;
  const chars = Array.from(text);

  const widths = chars.map(
    (c) => measureCharWidth(c, fontSize, fontFamily, fontWeight) + letterSpacing,
  );
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const totalAngle = totalWidth / radius;

  let angle = -totalAngle / 2;
  const result: CurvedChar[] = [];

  for (let i = 0; i < chars.length; i++) {
    const charAngle = angle + widths[i] / radius / 2;
    const theta = charAngle * direction;
    const x = Math.sin(theta) * radius;
    const y = -Math.cos(theta) * radius * direction + radius * direction;
    result.push({
      char: chars[i],
      x,
      y,
      rotation: (theta * 180) / Math.PI,
    });
    angle += widths[i] / radius;
  }

  return result;
}
