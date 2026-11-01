import Konva from "konva";

import type { Look } from "@/lib/appearance/look";
import { layoutCurvedText } from "@/lib/canvas/curved-text";
import { fitFrame, type SceneItem } from "@/lib/playback/scene";
import { buildTextNodes, textKey } from "@/lib/text/text-nodes";
import type { TextAdjustments } from "@/types/text-adjustments";

export interface ScenePainterOptions {
  container: HTMLDivElement;
  frame: { width: number; height: number };
  /** The loaded image for an image clip, or null while it is loading. */
  getImage(mediaId: string): HTMLImageElement | null;
  /** Called on every draw of a text clip; must be cheap and idempotent (it starts a font load once). */
  requestFont?(family: string): void;
}

export interface ScenePainter {
  render(scene: SceneItem[]): void;
  /** Forget the drawn text so the next render lays it out again (after a font loads). */
  invalidateText(): void;
  resize(width: number, height: number): void;
  /** Number of clip nodes currently on the stage (for the debug panel). */
  nodeCount(): number;
  destroy(): void;
}

interface ClipNodes {
  group: Konva.Group;
  image: Konva.Image;
  pictureGroup: Konva.Group;
  borderRect: Konva.Rect;
  /** Scratch canvas the filtered, rounded picture is drawn into, reused between frames. */
  filterCanvas: HTMLCanvasElement | null;
  /** What a still picture's scratch canvas was last drawn for, so an unchanged look is not redrawn. */
  filterKey: string | null;
  filterSource: CanvasImageSource | null;
  placeholder: Konva.Group;
  placeholderRect: Konva.Rect;
  placeholderText: Konva.Text;
  textGroup: Konva.Group;
  /** The textKey the text group was last built for. */
  textKey: string | null;
}

/** Filtered pictures are drawn at most this wide, however large the source is. */
const MAX_FILTER_WIDTH = 1920;

function traceRoundedRect(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(width, 0, width, height, r);
  ctx.arcTo(width, height, 0, height, r);
  ctx.arcTo(0, height, 0, 0, r);
  ctx.arcTo(0, 0, width, 0, r);
  ctx.closePath();
}

const supportsCanvasFilter =
  typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

/** The part of a source to draw, in its own pixels: the crop, or all of it. */
function sourceRegion(
  natural: { width: number; height: number },
  crop: { x: number; y: number; width: number; height: number } | null,
) {
  return crop && crop.width > 0 && crop.height > 0 ? crop : { x: 0, y: 0, ...natural };
}

/** The source's own size in pixels (before any cap), or null while it has none. */
function fullSize(source: CanvasImageSource): { width: number; height: number } | null {
  let width = 0;
  let height = 0;
  if (source instanceof HTMLVideoElement) {
    width = source.videoWidth;
    height = source.videoHeight;
  } else if (source instanceof HTMLImageElement) {
    width = source.naturalWidth;
    height = source.naturalHeight;
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

export function createScenePainter({
  container,
  frame,
  getImage,
  requestFont,
}: ScenePainterOptions): ScenePainter {
  const stage = new Konva.Stage({
    container,
    width: container.clientWidth || frame.width,
    height: container.clientHeight || frame.height,
  });
  // Nothing here is interactive, so skip the hit-detection canvas.
  const layer = new Konva.Layer({ listening: false });
  layer.clip({ x: 0, y: 0, width: frame.width, height: frame.height });
  stage.add(layer);
  layer.add(
    new Konva.Rect({ x: 0, y: 0, width: frame.width, height: frame.height, fill: "#000000" }),
  );

  const nodes = new Map<string, ClipNodes>();

  function fit(width: number, height: number) {
    const placement = fitFrame(width, height, frame.width, frame.height);
    stage.size({ width, height });
    stage.scale({ x: placement.scale, y: placement.scale });
    stage.position({ x: placement.x, y: placement.y });
  }
  fit(stage.width(), stage.height());

  function create(clipId: string): ClipNodes {
    const group = new Konva.Group({ name: clipId });
    const image = new Konva.Image({ image: undefined, visible: false });
    const placeholderRect = new Konva.Rect({
      fill: "rgba(139, 92, 246, 0.25)",
      stroke: "#8b5cf6",
      strokeWidth: 2,
    });
    const placeholderText = new Konva.Text({
      fill: "#ffffff",
      fontSize: 32,
      align: "center",
      verticalAlign: "middle",
    });
    const placeholder = new Konva.Group({ visible: false });
    placeholder.add(placeholderRect, placeholderText);
    const textGroup = new Konva.Group({ visible: false });
    const pictureGroup = new Konva.Group();
    pictureGroup.add(image);
    const borderRect = new Konva.Rect({ visible: false, listening: false });
    group.add(pictureGroup, borderRect, placeholder, textGroup);
    layer.add(group);
    const entry = {
      group,
      image,
      pictureGroup,
      borderRect,
      filterCanvas: null,
      filterKey: null,
      filterSource: null,
      placeholder,
      placeholderRect,
      placeholderText,
      textGroup,
      textKey: null,
    };
    nodes.set(clipId, entry);
    return entry;
  }

  /**
   * The picture to draw: the source itself, or a scratch-canvas copy when the
   * look needs a filter, blur or rounded corners baked in. Rounding is baked in
   * (not clipped by a group) so the picture's shadow follows its rounded shape.
   */
  function applyFilter(
    entry: ClipNodes,
    source: CanvasImageSource,
    look: Look | null,
    draw: { width: number; height: number },
  ): { source: CanvasImageSource; baked: boolean } {
    const radius = look?.border.radius ?? 0;
    const blur = look?.blurPx ?? 0;
    const filtered = supportsCanvasFilter && look !== null && (look.filter !== "none" || blur > 0);
    const full = look && (filtered || radius > 0) ? fullSize(source) : null;
    if (!look || !full || draw.width <= 0) {
      entry.filterCanvas = null;
      entry.filterKey = null;
      entry.filterSource = null;
      return { source, baked: false };
    }

    // The part of the file to show (its crop, or all of it), at no more than MAX_FILTER_WIDTH.
    const region = sourceRegion(full, look.crop);
    const shrink = Math.min(1, MAX_FILTER_WIDTH / region.width);
    const size = {
      width: Math.max(1, Math.round(region.width * shrink)),
      height: Math.max(1, Math.round(region.height * shrink)),
    };

    // Pixels per frame unit: blur and corner radius are set in frame units.
    const scale = size.width / draw.width;
    const parts = [look.filter === "none" ? "" : look.filter, blur > 0 ? `blur(${Number((blur * scale).toFixed(2))}px)` : ""];
    const css = filtered ? parts.filter(Boolean).join(" ") : "none";
    const key = [css, Number((radius * scale).toFixed(2)), size.width, size.height, region.x, region.y, region.width, region.height].join("|");

    // A still picture only needs drawing again when its look or source changes.
    const still = source instanceof HTMLImageElement;
    if (still && entry.filterCanvas && entry.filterKey === key && entry.filterSource === source) {
      return { source: entry.filterCanvas, baked: true };
    }

    const canvas = entry.filterCanvas ?? (entry.filterCanvas = document.createElement("canvas"));
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    const context = canvas.getContext("2d");
    if (!context) return { source, baked: false };
    context.clearRect(0, 0, size.width, size.height);
    context.save();
    if (radius > 0) {
      traceRoundedRect(context, size.width, size.height, radius * scale);
      context.clip();
    }
    context.filter = css;
    context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, size.width, size.height);
    context.restore();
    entry.filterKey = still ? key : null;
    entry.filterSource = still ? source : null;
    return { source: canvas, baked: true };
  }

  /** Flip, border, shadow and glow around the picture; all off when there is no look. */
  function paintLook(entry: ClipNodes, look: Look | null, draw: { width: number; height: number }) {
    const { width, height } = draw;
    const flipX = look?.flipX ?? false;
    const flipY = look?.flipY ?? false;
    entry.image.scale({ x: flipX ? -1 : 1, y: flipY ? -1 : 1 });
    entry.image.offset({ x: flipX ? width : 0, y: flipY ? height : 0 });

    const radius = look?.border.radius ?? 0;
    const borderWidth = look?.border.width ?? 0;
    entry.borderRect.visible(borderWidth > 0);
    if (borderWidth > 0 && look) {
      entry.borderRect.setAttrs({
        x: borderWidth / 2,
        y: borderWidth / 2,
        width: width - borderWidth,
        height: height - borderWidth,
        stroke: look.border.color,
        strokeWidth: borderWidth,
        cornerRadius: Math.max(0, radius - borderWidth / 2),
      });
    }

    // One shadow slot on the picture: a drop shadow wins over a glow when both are on.
    const shadow = look?.shadow ?? null;
    const glow = look?.glow ?? null;
    const effect = shadow ?? glow;
    entry.image.shadowEnabled(effect !== null);
    if (effect) {
      entry.image.shadowColor(effect.color);
      entry.image.shadowBlur(effect.blur);
      entry.image.shadowOpacity(effect.opacity / 100);
      entry.image.shadowOffsetX(shadow ? shadow.offsetX : 0);
      entry.image.shadowOffsetY(shadow ? shadow.offsetY : 0);
    }
  }

  function paintItem(entry: ClipNodes, item: SceneItem) {
    const { draw, content } = item;
    entry.group.setAttrs({
      x: draw.x,
      y: draw.y,
      rotation: draw.rotation,
      opacity: Math.max(0, Math.min(1, draw.opacity)),
    });

    let source: CanvasImageSource | null = null;
    let label: string | null = null;
    let text: TextAdjustments | null = null;
    if (content?.type === "video") {
      source = content.element as unknown as HTMLVideoElement;
    } else if (content?.type === "image") {
      source = getImage(content.mediaId);
    } else if (content?.type === "placeholder") {
      label = content.label;
    } else if (content?.type === "text") {
      text = content.adjustments;
    }

    entry.image.visible(source !== null);
    if (source !== null) {
      const prepared = applyFilter(entry, source, item.look, draw);
      entry.image.image(prepared.source);
      // A crop that was not baked into a scratch canvas is drawn by Konva itself.
      entry.image.setAttr("crop", prepared.baked ? undefined : (item.look?.crop ?? undefined));
      entry.image.size({ width: draw.width, height: draw.height });
    }
    paintLook(entry, source !== null ? item.look : null, draw);

    entry.placeholder.visible(label !== null);
    if (label !== null) {
      entry.placeholderRect.size({ width: draw.width, height: draw.height });
      entry.placeholderText.setAttrs({ text: label, width: draw.width, height: draw.height });
    }

    entry.textGroup.visible(text !== null);
    if (text !== null) {
      requestFont?.(text.fontFamily);
      const key = textKey(text, draw);
      if (key !== entry.textKey) {
        entry.textKey = key;
        entry.textGroup.destroyChildren();
        const curved =
          text.curve !== 0
            ? layoutCurvedText(
                text.content,
                text.fontSize,
                text.fontFamily,
                text.fontWeight,
                text.letterSpacing,
                text.curve,
              )
            : [];
        for (const attrs of buildTextNodes(text, draw, curved)) {
          const node = new Konva.Text(attrs);
          // Straight text has no fixed height (so nothing is cut off): centre it in the box.
          if (attrs.height === undefined && attrs.width !== undefined) {
            node.y((draw.height - node.height()) / 2);
          }
          entry.textGroup.add(node);
        }
      }
    }

    entry.group.visible(source !== null || label !== null || text !== null);
  }

  return {
    render(scene) {
      const seen = new Set<string>();
      scene.forEach((item, index) => {
        seen.add(item.clipId);
        const entry = nodes.get(item.clipId) ?? create(item.clipId);
        paintItem(entry, item);
        // Index 0 is the black frame, so clips start at 1, in paint order.
        entry.group.zIndex(index + 1);
      });
      for (const [clipId, entry] of Array.from(nodes)) {
        if (seen.has(clipId)) continue;
        entry.group.destroy();
        nodes.delete(clipId);
      }
      layer.batchDraw();
    },

    invalidateText() {
      for (const entry of nodes.values()) entry.textKey = null;
    },

    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      fit(width, height);
      layer.batchDraw();
    },

    nodeCount: () => nodes.size,

    destroy() {
      nodes.clear();
      stage.destroy();
    },
  };
}
