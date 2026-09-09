"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";
import { useEditorUiStore } from "@/store/use-editor-ui-store";

export function WelcomeTourDialog() {
  const open = useEditorUiStore((s) => s.tourOpen);
  const setOpen = useEditorUiStore((s) => s.setTourOpen);
  const [stepIndex, setStepIndex] = React.useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setStepIndex(0);
  }

  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center px-2 pt-2 pb-1 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <step.icon className="size-6" />
          </div>
          <DialogTitle className="text-lg">{step.title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm">
            {step.description}
          </DialogDescription>

          <div className="mt-6 flex items-center gap-1.5">
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

          <div className="mt-6 flex w-full items-center gap-2">
            {stepIndex > 0 ? (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStepIndex((i) => i - 1)}
              >
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => handleOpenChange(false)}
              >
                Skip
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={() =>
                isLastStep
                  ? handleOpenChange(false)
                  : setStepIndex((i) => i + 1)
              }
            >
              {isLastStep ? "Start creating" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
