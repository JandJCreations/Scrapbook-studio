"use client";

import * as React from "react";

import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";
import { useTextEditingStore } from "@/store/use-text-editing-store";

export function TextEditOverlay({ projectId }: { projectId: string }) {
  const editingObjectId = useTextEditingStore((s) => s.editingObjectId);
  const stopEditing = useTextEditingStore((s) => s.stopEditing);
  const objects = useCanvasObjects(projectId);
  const updateTextAdjustments = useCanvasStore((s) => s.updateTextAdjustments);
  const viewport = useCanvasStore((s) => s.viewport);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const object = objects.find((o) => o.id === editingObjectId);

  React.useEffect(() => {
    if (object) textareaRef.current?.focus();
  }, [object]);

  if (!object || !object.textAdjustments) return null;
  const adjustments = object.textAdjustments;

  function commit() {
    if (!object) return;
    const value = textareaRef.current?.value ?? "";
    updateTextAdjustments(projectId, object.id, {
      content: value.trim().length > 0 ? value : "Text",
    });
    stopEditing();
  }

  return (
    <textarea
      ref={textareaRef}
      defaultValue={adjustments.content}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          stopEditing();
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
      }}
      className="absolute resize-none overflow-hidden border-2 border-primary bg-white/90 outline-none"
      style={{
        left: viewport.x + object.x * viewport.scale,
        top: viewport.y + object.y * viewport.scale,
        width: object.width * viewport.scale,
        height: object.height * viewport.scale,
        fontSize: adjustments.fontSize * viewport.scale,
        fontFamily: adjustments.fontFamily,
        fontWeight: adjustments.fontWeight,
        color: adjustments.color,
        textAlign: adjustments.align,
        lineHeight: adjustments.lineHeight,
        letterSpacing: adjustments.letterSpacing,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: "0 0",
      }}
    />
  );
}
