"use client";

import * as React from "react";

import type { TextAdjustments } from "@/types/text-adjustments";

interface TextEditOverlayProps {
  /** The clip's box in frame units. */
  box: { x: number; y: number; width: number; height: number; rotation: number };
  /** How the frame sits in the stage: scale and offset in pixels. */
  fit: { scale: number; x: number; y: number };
  adjustments: TextAdjustments;
  onCommit(content: string): void;
  onCancel(): void;
}

/** True for a #rgb or #rrggbb colour that is bright enough to vanish on a light backing. */
function isLight(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const full = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/** A textarea laid over a text clip on the stage for editing its words in place. */
export function TextEditOverlay({ box, fit, adjustments, onCommit, onCancel }: TextEditOverlayProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  // Escape and Enter end the edit themselves; the blur that follows must not end it twice.
  const done = React.useRef(false);

  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commit() {
    if (done.current) return;
    done.current = true;
    const value = ref.current?.value ?? "";
    onCommit(value.trim().length > 0 ? value : "Text");
  }

  function cancel() {
    if (done.current) return;
    done.current = true;
    onCancel();
  }

  return (
    <textarea
      ref={ref}
      aria-label="Edit text on the stage"
      defaultValue={adjustments.content}
      onBlur={commit}
      onKeyDown={(event) => {
        // Keys typed here are words, never timeline shortcuts.
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commit();
        }
      }}
      className="absolute resize-none overflow-hidden border-2 border-primary outline-none"
      style={{
        left: fit.x + box.x * fit.scale,
        top: fit.y + box.y * fit.scale,
        width: box.width * fit.scale,
        height: box.height * fit.scale,
        fontSize: adjustments.fontSize * fit.scale,
        fontFamily: adjustments.fontFamily,
        fontWeight: adjustments.fontWeight,
        color: adjustments.color,
        backgroundColor: isLight(adjustments.color) ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.9)",
        textAlign: adjustments.align,
        lineHeight: adjustments.lineHeight,
        letterSpacing: adjustments.letterSpacing * fit.scale,
        transform: `rotate(${box.rotation}deg)`,
        transformOrigin: "0 0",
      }}
    />
  );
}
