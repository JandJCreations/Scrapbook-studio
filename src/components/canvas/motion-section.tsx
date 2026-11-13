"use client";

import { Move } from "lucide-react";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MOTION_OPTIONS } from "@/lib/canvas/effects";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/use-canvas-store";
import { useTimelineStore } from "@/store/use-timeline-store";
import type { CanvasObject } from "@/types/canvas";
import type { MotionType } from "@/types/object-extras";

/** Pick a movement that plays for the whole time the object is on screen. */
export function MotionSection({
  projectId,
  object,
}: {
  projectId: string;
  object: CanvasObject;
}) {
  const updateExtras = useCanvasStore((s) => s.updateExtras);
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime);
  const play = useTimelineStore((s) => s.play);
  const current = object.extras?.motion ?? null;

  function choose(motion: MotionType | null) {
    updateExtras(projectId, object.id, { motion: motion ?? undefined });
    if (motion) {
      setPlayheadTime(object.startTime);
      play();
    }
  }

  return (
    <AccordionItem value="motion">
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          <Move className="size-4 text-muted-foreground" />
          Motion
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          {[{ type: null, label: "None", hint: "Stays still" } as const, ...MOTION_OPTIONS].map(
            (option) => (
              <button
                key={option.type ?? "none"}
                type="button"
                title={option.hint}
                onClick={() => choose(option.type)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  current === option.type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            ),
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Plays for as long as this is on screen. Picking one previews it.
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
