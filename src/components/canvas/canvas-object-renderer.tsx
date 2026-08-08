import * as React from "react";
import Konva from "konva";
import { Group, Image as KonvaImage, Rect } from "react-konva";

import { applyFilterAttrs, getActiveFilters } from "@/lib/canvas/get-active-filters";
import { getInterpolatedTransform, isObjectVisibleAt } from "@/lib/canvas/interpolate";
import { roundedRectClip } from "@/lib/canvas/rounded-rect-clip";
import { useImageElement } from "@/hooks/use-image-element";
import { TextObjectRenderer } from "@/components/canvas/text-object-renderer";
import { VideoObjectRenderer } from "@/components/canvas/video-object-renderer";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { CanvasObject } from "@/types/canvas";

interface CanvasObjectRendererProps {
  object: CanvasObject;
  isSelected: boolean;
  onSelect: (object: CanvasObject, shiftKey: boolean) => void;
  onDragStart: (object: CanvasObject) => void;
  onDragMove: (object: CanvasObject, node: Konva.Node) => void;
  onDragEnd: (object: CanvasObject, node: Konva.Node) => void;
  registerNode: (id: string, node: Konva.Node | null) => void;
}

export const CanvasObjectRenderer = React.memo(function CanvasObjectRenderer({
  object,
  isSelected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  registerNode,
}: CanvasObjectRendererProps) {
  const image = useImageElement(object.src);
  const imageRef = React.useRef<Konva.Image>(null);
  const adjustments = object.adjustments;
  const playheadTime = useTimelineStore((s) => s.playheadTime);

  React.useEffect(() => {
    const node = imageRef.current;
    if (!node || !adjustments) return;
    applyFilterAttrs(node, adjustments);
    node.cache();
    node.getLayer()?.batchDraw();
  }, [adjustments, image, object.width, object.height]);

  if (!isObjectVisibleAt(object, playheadTime)) {
    return null;
  }

  const transform = getInterpolatedTransform(object, playheadTime);

  const commonProps = {
    ref: (node: Konva.Node | null) => registerNode(object.id, node),
    x: transform.x,
    y: transform.y,
    width: object.width,
    height: object.height,
    rotation: transform.rotation,
    opacity: transform.opacity,
    draggable: !object.locked,
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) =>
      onSelect(object, e.evt.shiftKey),
    onTap: (e: Konva.KonvaEventObject<TouchEvent>) =>
      onSelect(object, e.evt.shiftKey),
    onDragStart: () => onDragStart(object),
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) =>
      onDragMove(object, e.target),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      onDragEnd(object, e.target),
  };

  if (object.type === "video" && object.videoAdjustments) {
    return (
      <VideoObjectRenderer
        object={object}
        isSelected={isSelected}
        commonProps={commonProps}
      />
    );
  }

  if (object.type === "text" && object.textAdjustments) {
    return (
      <TextObjectRenderer
        object={object}
        isSelected={isSelected}
        commonProps={commonProps}
      />
    );
  }

  if (!adjustments) {
    return (
      <Group {...commonProps}>
        <KonvaImage
          image={image ?? undefined}
          width={object.width}
          height={object.height}
          opacity={image ? 1 : 0.3}
        />
        {isSelected && (
          <Rect
            width={object.width}
            height={object.height}
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeScaleEnabled={false}
            listening={false}
          />
        )}
      </Group>
    );
  }

  const radius = Math.min(
    adjustments.borderRadius,
    object.width / 2,
    object.height / 2,
  );

  return (
    <Group {...commonProps}>
      {adjustments.glow.enabled && (
        <Rect
          width={object.width}
          height={object.height}
          cornerRadius={radius}
          fill={adjustments.glow.color}
          listening={false}
          shadowEnabled
          shadowColor={adjustments.glow.color}
          shadowBlur={adjustments.glow.blur}
          shadowOffsetX={0}
          shadowOffsetY={0}
          shadowOpacity={adjustments.glow.opacity / 100}
        />
      )}
      {adjustments.shadow.enabled && (
        <Rect
          width={object.width}
          height={object.height}
          cornerRadius={radius}
          fill={adjustments.shadow.color}
          listening={false}
          shadowEnabled
          shadowColor={adjustments.shadow.color}
          shadowBlur={adjustments.shadow.blur}
          shadowOffsetX={adjustments.shadow.offsetX}
          shadowOffsetY={adjustments.shadow.offsetY}
          shadowOpacity={adjustments.shadow.opacity / 100}
        />
      )}
      <Group
        clipFunc={
          radius > 0
            ? (ctx) =>
                roundedRectClip(ctx, object.width, object.height, radius)
            : undefined
        }
        globalCompositeOperation={adjustments.blendMode}
      >
        <KonvaImage
          ref={imageRef}
          image={image ?? undefined}
          width={object.width}
          height={object.height}
          crop={adjustments.crop ?? undefined}
          x={adjustments.flipHorizontal ? object.width : 0}
          y={adjustments.flipVertical ? object.height : 0}
          scaleX={adjustments.flipHorizontal ? -1 : 1}
          scaleY={adjustments.flipVertical ? -1 : 1}
          opacity={(image ? 1 : 0.3) * (adjustments.opacity / 100)}
          stroke={adjustments.borderWidth > 0 ? adjustments.borderColor : undefined}
          strokeWidth={adjustments.borderWidth}
          strokeScaleEnabled={false}
          filters={getActiveFilters(adjustments)}
        />
      </Group>
      {isSelected && (
        <Rect
          width={object.width}
          height={object.height}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </Group>
  );
});
