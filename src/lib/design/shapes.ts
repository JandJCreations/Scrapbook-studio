import type { BackgroundSpec, ShapeKind, ShapeSpec } from "@/types/object-extras";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeAttr(value: string): string {
  return value.replace(/[^#a-zA-Z0-9(),.% -]/g, "");
}

const PATHS: Record<ShapeKind, (s: number) => string> = {
  rectangle: (s) => `<rect x="${s}" y="${s}" width="${100 - 2 * s}" height="${100 - 2 * s}"/>`,
  rounded: (s) =>
    `<rect x="${s}" y="${s}" width="${100 - 2 * s}" height="${100 - 2 * s}" rx="16" ry="16"/>`,
  circle: (s) => `<ellipse cx="50" cy="50" rx="${50 - s}" ry="${50 - s}"/>`,
  triangle: (s) => `<polygon points="50,${s} ${100 - s},${100 - s} ${s},${100 - s}"/>`,
  star: () =>
    `<polygon points="50,4 61,37 96,37 68,58 78,92 50,72 22,92 32,58 4,37 39,37"/>`,
  heart: () =>
    `<path d="M50 88 C20 66 4 50 4 30 C4 15 16 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C84 6 96 15 96 30 C96 50 80 66 50 88 Z"/>`,
  line: () => `<line x1="2" y1="50" x2="98" y2="50"/>`,
  arrow: () => `<path d="M4 40 H66 V22 L96 50 L66 78 V60 H4 Z"/>`,
};

/** An editable basic shape as an SVG image that stretches to any size. */
export function shapeToDataUrl(spec: ShapeSpec): string {
  const stroke = spec.strokeWidth > 0 ? escapeAttr(spec.stroke) : "none";
  const inset = spec.kind === "line" ? 0 : Math.min(10, spec.strokeWidth / 2);
  const isLine = spec.kind === "line";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<g fill="${isLine ? "none" : escapeAttr(spec.fill)}" stroke="${isLine ? escapeAttr(spec.fill) : stroke}" ` +
    `stroke-width="${isLine ? Math.max(1, spec.strokeWidth || 4) : spec.strokeWidth}" ` +
    `vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round">` +
    PATHS[spec.kind](inset) +
    `</g></svg>`;
  return svgDataUrl(svg);
}

/** A page background: a solid colour or a top-left → bottom-right gradient. */
export function backgroundToDataUrl(bg: BackgroundSpec): string {
  const fill = bg.color2
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${escapeAttr(bg.color)}"/>` +
      `<stop offset="1" stop-color="${escapeAttr(bg.color2)}"/></linearGradient></defs>` +
      `<rect width="100" height="100" fill="url(#g)"/>`
    : `<rect width="100" height="100" fill="${escapeAttr(bg.color)}"/>`;
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${fill}</svg>`,
  );
}

export const SHAPE_OPTIONS: { kind: ShapeKind; label: string }[] = [
  { kind: "rectangle", label: "Square" },
  { kind: "rounded", label: "Rounded" },
  { kind: "circle", label: "Circle" },
  { kind: "triangle", label: "Triangle" },
  { kind: "star", label: "Star" },
  { kind: "heart", label: "Heart" },
  { kind: "line", label: "Line" },
  { kind: "arrow", label: "Arrow" },
];

export const BACKGROUND_PRESETS: BackgroundSpec[] = [
  { color: "#ffffff" },
  { color: "#fdf6e3" },
  { color: "#fce7f3" },
  { color: "#e0f2fe" },
  { color: "#dcfce7" },
  { color: "#1f2937" },
  { color: "#000000" },
  { color: "#fde68a", color2: "#f9a8d4" },
  { color: "#a5f3fc", color2: "#c4b5fd" },
  { color: "#fecaca", color2: "#fed7aa" },
  { color: "#bbf7d0", color2: "#bfdbfe" },
  { color: "#312e81", color2: "#db2777" },
];

export function backgroundCss(bg: BackgroundSpec): string {
  return bg.color2 ? `linear-gradient(135deg, ${bg.color}, ${bg.color2})` : bg.color;
}
