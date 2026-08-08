import * as React from "react";
import { Group, Rect, Text as KonvaText } from "react-konva";

import { layoutCurvedText } from "@/lib/canvas/curved-text";
import { useTextEditingStore } from "@/store/use-text-editing-store";
import type { CanvasObject } from "@/types/canvas";
import type { TextAdjustments } from "@/types/text-adjustments";

interface TextObjectRendererProps {
  object: CanvasObject;
  isSelected: boolean;
  commonProps: Record<string, unknown>;
}

export function TextObjectRenderer({
  object,
  isSelected,
  commonProps,
}: TextObjectRendererProps) {
  const adjustments = object.textAdjustments as TextAdjustments;
  const startEditing = useTextEditingStore((s) => s.startEditing);
  const isEditing = useTextEditingStore((s) => s.editingObjectId === object.id);

  const fontStyle = adjustments.fontWeight >= 700 ? "bold" : "normal";
  const gradientProps = adjustments.gradient.enabled
    ? {
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: object.width, y: 0 },
        fillLinearGradientColorStops: [
          0,
          adjustments.gradient.from,
          1,
          adjustments.gradient.to,
        ],
      }
    : { fill: adjustments.color };

  const curvedChars = React.useMemo(
    () =>
      adjustments.curve !== 0
        ? layoutCurvedText(
            adjustments.content,
            adjustments.fontSize,
            adjustments.fontFamily,
            adjustments.fontWeight,
            adjustments.letterSpacing,
            adjustments.curve,
          )
        : [],
    [
      adjustments.content,
      adjustments.fontSize,
      adjustments.fontFamily,
      adjustments.fontWeight,
      adjustments.letterSpacing,
      adjustments.curve,
    ],
  );

  return (
    <Group {...commonProps} onDblClick={() => startEditing(object.id)}>
      {adjustments.glow.enabled && !isEditing && (
        <>
          {curvedChars.length > 0 ? (
            curvedChars.map((c, i) => (
              <KonvaText
                key={i}
                text={c.char}
                x={object.width / 2 + c.x}
                y={object.height / 2 + c.y}
                offsetX={0}
                rotation={c.rotation}
                fontSize={adjustments.fontSize}
                fontFamily={adjustments.fontFamily}
                fontStyle={fontStyle}
                fill={adjustments.glow.color}
                listening={false}
                shadowEnabled
                shadowColor={adjustments.glow.color}
                shadowBlur={adjustments.glow.blur}
                shadowOpacity={adjustments.glow.opacity / 100}
              />
            ))
          ) : (
            <KonvaText
              text={adjustments.content}
              width={object.width}
              height={object.height}
              align={adjustments.align}
              verticalAlign="middle"
              fontSize={adjustments.fontSize}
              fontFamily={adjustments.fontFamily}
              fontStyle={fontStyle}
              letterSpacing={adjustments.letterSpacing}
              lineHeight={adjustments.lineHeight}
              fill={adjustments.glow.color}
              listening={false}
              shadowEnabled
              shadowColor={adjustments.glow.color}
              shadowBlur={adjustments.glow.blur}
              shadowOpacity={adjustments.glow.opacity / 100}
            />
          )}
        </>
      )}

      {!isEditing &&
        (curvedChars.length > 0 ? (
          curvedChars.map((c, i) => (
            <KonvaText
              key={i}
              text={c.char}
              x={object.width / 2 + c.x}
              y={object.height / 2 + c.y}
              rotation={c.rotation}
              fontSize={adjustments.fontSize}
              fontFamily={adjustments.fontFamily}
              fontStyle={fontStyle}
              fill={adjustments.color}
              stroke={adjustments.stroke.enabled ? adjustments.stroke.color : undefined}
              strokeWidth={adjustments.stroke.enabled ? adjustments.stroke.width : 0}
              shadowEnabled={adjustments.shadow.enabled}
              shadowColor={adjustments.shadow.color}
              shadowBlur={adjustments.shadow.blur}
              shadowOffsetX={adjustments.shadow.offsetX}
              shadowOffsetY={adjustments.shadow.offsetY}
              shadowOpacity={adjustments.shadow.opacity / 100}
            />
          ))
        ) : (
          <KonvaText
            text={adjustments.content}
            width={object.width}
            height={object.height}
            align={adjustments.align}
            verticalAlign="middle"
            fontSize={adjustments.fontSize}
            fontFamily={adjustments.fontFamily}
            fontStyle={fontStyle}
            letterSpacing={adjustments.letterSpacing}
            lineHeight={adjustments.lineHeight}
            {...gradientProps}
            stroke={adjustments.stroke.enabled ? adjustments.stroke.color : undefined}
            strokeWidth={adjustments.stroke.enabled ? adjustments.stroke.width : 0}
            shadowEnabled={adjustments.shadow.enabled}
            shadowColor={adjustments.shadow.color}
            shadowBlur={adjustments.shadow.blur}
            shadowOffsetX={adjustments.shadow.offsetX}
            shadowOffsetY={adjustments.shadow.offsetY}
            shadowOpacity={adjustments.shadow.opacity / 100}
          />
        ))}

      {isSelected && !isEditing && (
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
