import type { CurvedChar } from "@/lib/canvas/curved-text";
import type { TextAdjustments } from "@/types/text-adjustments";

/** Konva.Text attributes for one drawn piece of a text clip. */
export type TextNodeAttrs = Record<string, unknown>;

/**
 * The Konva text nodes that draw a text clip, bottom first: a glow copy when
 * the glow is on, then the text itself. Straight text is one node filling the
 * clip's box; curved text is one node per character laid out around the box
 * centre (`curved` comes from layoutCurvedText and is empty for straight text).
 */
export function buildTextNodes(
  adj: TextAdjustments,
  size: { width: number; height: number },
  curved: CurvedChar[],
): TextNodeAttrs[] {
  const isCurved = curved.length > 0;
  const opacity = adj.opacity / 100;
  const base = {
    fontSize: adj.fontSize,
    fontFamily: adj.fontFamily,
    fontStyle: adj.fontWeight >= 700 ? "bold" : "normal",
    opacity,
  };
  const box = {
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    align: adj.align,
    verticalAlign: "middle",
    letterSpacing: adj.letterSpacing,
    lineHeight: adj.lineHeight,
  };

  const place = (fill: Record<string, unknown>, extra: Record<string, unknown>): TextNodeAttrs[] =>
    isCurved
      ? curved.map((c) => ({
          ...base,
          ...fill,
          ...extra,
          text: c.char,
          x: size.width / 2 + c.x,
          y: size.height / 2 + c.y,
          rotation: c.rotation,
        }))
      : [{ ...base, ...box, ...fill, ...extra, text: adj.content }];

  const nodes: TextNodeAttrs[] = [];

  if (adj.glow.enabled) {
    nodes.push(
      ...place(
        { fill: adj.glow.color },
        {
          listening: false,
          shadowEnabled: true,
          shadowColor: adj.glow.color,
          shadowBlur: adj.glow.blur,
          shadowOpacity: adj.glow.opacity / 100,
        },
      ),
    );
  }

  const fill =
    adj.gradient.enabled && !isCurved
      ? {
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: size.width, y: 0 },
          fillLinearGradientColorStops: [0, adj.gradient.from, 1, adj.gradient.to],
        }
      : { fill: adj.color };

  nodes.push(
    ...place(fill, {
      stroke: adj.stroke.enabled ? adj.stroke.color : undefined,
      strokeWidth: adj.stroke.enabled ? adj.stroke.width : 0,
      shadowEnabled: adj.shadow.enabled,
      shadowColor: adj.shadow.color,
      shadowBlur: adj.shadow.blur,
      shadowOffsetX: adj.shadow.offsetX,
      shadowOffsetY: adj.shadow.offsetY,
      shadowOpacity: adj.shadow.opacity / 100,
    }),
  );

  return nodes;
}

/** A stable string that changes exactly when the drawn text would. */
export function textKey(adj: TextAdjustments, size: { width: number; height: number }): string {
  return JSON.stringify([adj, size.width, size.height]);
}
