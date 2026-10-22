import Konva from "konva";

import { fitFrame, type SceneItem } from "@/lib/playback/scene";

export interface ScenePainterOptions {
  container: HTMLDivElement;
  frame: { width: number; height: number };
  /** The loaded image for an image clip, or null while it is loading. */
  getImage(mediaId: string): HTMLImageElement | null;
}

export interface ScenePainter {
  render(scene: SceneItem[]): void;
  resize(width: number, height: number): void;
  /** Number of clip nodes currently on the stage (for the debug panel). */
  nodeCount(): number;
  destroy(): void;
}

interface ClipNodes {
  group: Konva.Group;
  image: Konva.Image;
  placeholder: Konva.Group;
  placeholderRect: Konva.Rect;
  placeholderText: Konva.Text;
}

export function createScenePainter({ container, frame, getImage }: ScenePainterOptions): ScenePainter {
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
    group.add(image, placeholder);
    layer.add(group);
    const entry = { group, image, placeholder, placeholderRect, placeholderText };
    nodes.set(clipId, entry);
    return entry;
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
    if (content?.type === "video") {
      source = content.element as unknown as HTMLVideoElement;
    } else if (content?.type === "image") {
      source = getImage(content.mediaId);
    } else if (content?.type === "placeholder") {
      label = content.label;
    }

    entry.image.visible(source !== null);
    if (source !== null) {
      entry.image.image(source);
      entry.image.size({ width: draw.width, height: draw.height });
    }

    entry.placeholder.visible(label !== null);
    if (label !== null) {
      entry.placeholderRect.size({ width: draw.width, height: draw.height });
      entry.placeholderText.setAttrs({ text: label, width: draw.width, height: draw.height });
    }

    entry.group.visible(source !== null || label !== null);
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
