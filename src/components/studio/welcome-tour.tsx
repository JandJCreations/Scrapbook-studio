"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTourTargetRect } from "@/hooks/use-tour-target-rect";
import { cn } from "@/lib/utils";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";

const CALLOUT_WIDTH = 300;
const VIEWPORT_MARGIN = 12;

export function WelcomeTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const [stepIndex, setStepIndex] = React.useState(0);
  // The same phone breakpoint the studio view uses for its Tools sheet.
  const isMobile = useMediaQuery("(max-width: 639px)");
  const nextRef = React.useRef<HTMLButtonElement>(null);
  // However it was closed, the next tour starts from the first step.
  if (!open && stepIndex !== 0) setStepIndex(0);

  // Focus moves into the tour, so Space and Delete do not act on the editor behind it.
  React.useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open]);

  const step = open ? TOUR_STEPS[stepIndex] : undefined;
  // Some targets (e.g. the Media tab) live inside a sheet that's only
  // rendered on mobile once opened — rather than opening it ourselves
  // (real animation timing, real state, another thing to get wrong),
  // point at its always-visible trigger button on mobile instead.
  const effectiveSelector = step
    ? isMobile && step.mobileTargetSelector
      ? step.mobileTargetSelector
      : step.targetSelector
    : undefined;
  const rect = useTourTargetRect(effectiveSelector);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !step) return null;

  function handleClose() {
    onOpenChange(false);
    setStepIndex(0);
  }

  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  const calloutStyle: React.CSSProperties = rect
    ? computeCalloutPosition(rect)
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Quick tour"
    >
      {/* Catches clicks on the rest of the app without heavily darkening it — the highlight ring is what should draw the eye, not a dimmed backdrop. */}
      <button
        type="button"
        aria-label="Close tour"
        className="absolute inset-0 size-full cursor-default bg-black/10"
        onClick={handleClose}
      />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-[3px] ring-primary ring-offset-2 ring-offset-background transition-all duration-150"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      <div
        className="absolute flex w-[300px] flex-col items-center rounded-2xl bg-popover p-4 text-center text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        style={calloutStyle}
      >
        <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <step.icon className="size-5" />
        </div>
        <h3 className="text-base font-medium">{step.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIndex ? "w-5 bg-primary" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex w-full items-center gap-2">
          {stepIndex > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setStepIndex((i) => i - 1)}
            >
              Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="flex-1" onClick={handleClose}>
              Skip
            </Button>
          )}
          <Button
            ref={nextRef}
            size="sm"
            className="flex-1"
            onClick={() => (isLastStep ? handleClose() : setStepIndex((i) => i + 1))}
          >
            {isLastStep ? "Start creating" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function computeCalloutPosition(rect: DOMRect): React.CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedCalloutHeight = 260;

  const fitsBelow = rect.bottom + estimatedCalloutHeight + VIEWPORT_MARGIN < viewportHeight;
  const top = fitsBelow
    ? rect.bottom + VIEWPORT_MARGIN
    : Math.max(VIEWPORT_MARGIN, rect.top - estimatedCalloutHeight - VIEWPORT_MARGIN);

  const idealLeft = rect.left + rect.width / 2 - CALLOUT_WIDTH / 2;
  const left = Math.min(
    Math.max(idealLeft, VIEWPORT_MARGIN),
    viewportWidth - CALLOUT_WIDTH - VIEWPORT_MARGIN,
  );

  return { top, left };
}
