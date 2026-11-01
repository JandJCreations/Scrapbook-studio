import { describe, expect, it } from "vitest";

import { buildTextNodes, textKey } from "@/lib/text/text-nodes";
import { DEFAULT_TEXT_ADJUSTMENTS, type TextAdjustments } from "@/types/text-adjustments";

const size = { width: 400, height: 100 };
const adj = (patch: Partial<TextAdjustments> = {}): TextAdjustments => ({
  ...DEFAULT_TEXT_ADJUSTMENTS,
  content: "Hello",
  ...patch,
});

describe("buildTextNodes", () => {
  it("draws straight text as one node filling the box", () => {
    const nodes = buildTextNodes(adj(), size, []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      text: "Hello",
      x: 0,
      y: 0,
      width: 400,
      height: 100,
      align: "center",
      verticalAlign: "middle",
      fontSize: 42,
      fontFamily: "Inter",
      fontStyle: "bold",
      letterSpacing: 0,
      lineHeight: 1.2,
      fill: "#1f2937",
      opacity: 1,
    });
  });

  it("uses normal weight below 700", () => {
    expect(buildTextNodes(adj({ fontWeight: 400 }), size, [])[0].fontStyle).toBe("normal");
  });

  it("fills with a gradient across the box instead of a flat colour", () => {
    const [node] = buildTextNodes(
      adj({ gradient: { enabled: true, from: "#111111", to: "#222222" } }),
      size,
      [],
    );
    expect(node.fill).toBeUndefined();
    expect(node.fillLinearGradientStartPoint).toEqual({ x: 0, y: 0 });
    expect(node.fillLinearGradientEndPoint).toEqual({ x: 400, y: 0 });
    expect(node.fillLinearGradientColorStops).toEqual([0, "#111111", 1, "#222222"]);
  });

  it("only strokes when enabled", () => {
    const off = buildTextNodes(adj(), size, [])[0];
    expect(off.stroke).toBeUndefined();
    expect(off.strokeWidth).toBe(0);
    const on = buildTextNodes(
      adj({ stroke: { enabled: true, color: "#ffffff", width: 3 } }),
      size,
      [],
    )[0];
    expect(on).toMatchObject({ stroke: "#ffffff", strokeWidth: 3 });
  });

  it("maps the shadow settings", () => {
    const [node] = buildTextNodes(
      adj({
        shadow: { enabled: true, color: "#000000", blur: 8, offsetX: 1, offsetY: 4, opacity: 40 },
      }),
      size,
      [],
    );
    expect(node).toMatchObject({
      shadowEnabled: true,
      shadowColor: "#000000",
      shadowBlur: 8,
      shadowOffsetX: 1,
      shadowOffsetY: 4,
      shadowOpacity: 0.4,
    });
  });

  it("puts a glow node first, drawn in the glow colour", () => {
    const nodes = buildTextNodes(
      adj({ glow: { enabled: true, color: "#ff00ff", blur: 20, opacity: 60 } }),
      size,
      [],
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      fill: "#ff00ff",
      shadowEnabled: true,
      shadowColor: "#ff00ff",
      shadowBlur: 20,
      shadowOpacity: 0.6,
      listening: false,
    });
    expect(nodes[1].fill).toBe("#1f2937");
  });

  it("scales opacity from percent", () => {
    expect(buildTextNodes(adj({ opacity: 25 }), size, [])[0].opacity).toBe(0.25);
  });

  it("lays curved text out one node per character around the box centre", () => {
    const curved = [
      { char: "H", x: -10, y: 2, rotation: -5 },
      { char: "i", x: 10, y: 2, rotation: 5 },
    ];
    const nodes = buildTextNodes(adj({ curve: 40, content: "Hi" }), size, curved);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ text: "H", x: 190, y: 52, rotation: -5, fontSize: 42 });
    expect(nodes[1]).toMatchObject({ text: "i", x: 210, y: 52, rotation: 5 });
    expect(nodes[0].width).toBeUndefined();
  });
});

describe("textKey", () => {
  it("changes with the content, the style or the size, and otherwise stays put", () => {
    const base = textKey(adj(), size);
    expect(textKey(adj(), { ...size })).toBe(base);
    expect(textKey(adj({ content: "Other" }), size)).not.toBe(base);
    expect(textKey(adj({ color: "#ffffff" }), size)).not.toBe(base);
    expect(textKey(adj(), { width: 401, height: 100 })).not.toBe(base);
  });
});
