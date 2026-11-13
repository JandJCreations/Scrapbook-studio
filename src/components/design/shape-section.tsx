"use client";

import { Shapes } from "lucide-react";

import { AdjustmentSlider } from "@/components/canvas/adjustment-slider";
import { ColorField } from "@/components/design/color-field";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCanvasStore } from "@/store/use-canvas-store";
import type { CanvasObject } from "@/types/canvas";

/** Colours and outline for a basic shape. */
export function ShapeSection({ projectId, object }: { projectId: string; object: CanvasObject }) {
  const updateShape = useCanvasStore((s) => s.updateShape);
  const shape = object.extras?.shape;
  if (!shape) return null;
  const isLine = shape.kind === "line";

  return (
    <AccordionItem value="shape">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          <Shapes className="size-4 text-muted-foreground" />
          Shape
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-3">
        <ColorField
          label={isLine ? "Line colour" : "Fill"}
          value={shape.fill}
          onChange={(fill) => updateShape(projectId, object.id, { fill })}
        />
        {!isLine && (
          <ColorField
            label="Outline"
            value={shape.stroke}
            onChange={(stroke) => updateShape(projectId, object.id, { stroke })}
          />
        )}
        <AdjustmentSlider
          label={isLine ? "Thickness" : "Outline width"}
          value={shape.strokeWidth}
          min={0}
          max={24}
          onChange={(strokeWidth) => updateShape(projectId, object.id, { strokeWidth })}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
