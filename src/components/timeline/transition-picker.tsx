"use client";

import { ArrowLeftRight, Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TRANSITION_LENGTHS, TRANSITION_OPTIONS } from "@/lib/canvas/effects";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/use-canvas-store";
import type { CanvasObject } from "@/types/canvas";
import type { TransitionType } from "@/types/object-extras";

const DEFAULT_LENGTH = 0.8;

interface TransitionPickerProps {
  projectId: string;
  /** The clip the transition leads into. */
  clip: CanvasObject;
  left: number;
}

/** The little button sitting between two story clips. */
export function TransitionPicker({ projectId, clip, left }: TransitionPickerProps) {
  const setTransitionIn = useCanvasStore((s) => s.setTransitionIn);
  const setTransitionForAll = useCanvasStore((s) => s.setTransitionForAll);
  const current = clip.extras?.transitionIn ?? null;
  const label = current
    ? (TRANSITION_OPTIONS.find((o) => o.type === current.type)?.label ?? "Transition")
    : "Add transition";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={current ? `Transition: ${label}` : "Add a transition"}
          title={label}
          className={cn(
            "absolute top-1/2 z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background shadow",
            current
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          style={{ left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {current ? <ArrowLeftRight className="size-3" /> : <Plus className="size-3" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuLabel>Transition</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current?.type ?? "none"}
          onValueChange={(value) =>
            setTransitionIn(
              projectId,
              clip.id,
              value === "none"
                ? null
                : {
                    type: value as TransitionType,
                    duration: current?.duration ?? DEFAULT_LENGTH,
                  },
            )
          }
        >
          <DropdownMenuRadioItem value="none">None (cut)</DropdownMenuRadioItem>
          {TRANSITION_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.type} value={option.type}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Length</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(current.duration)}
              onValueChange={(value) =>
                setTransitionIn(projectId, clip.id, { ...current, duration: Number(value) })
              }
            >
              {TRANSITION_LENGTHS.map((length) => (
                <DropdownMenuRadioItem key={length.seconds} value={String(length.seconds)}>
                  {length.label} ({length.seconds}s)
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTransitionForAll(projectId, current)}>
              Use between all clips
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
