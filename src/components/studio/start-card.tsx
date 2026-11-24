"use client";

import * as React from "react";
import { ImagePlus, Loader2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface StartCardProps {
  /** Photos and clips the user just picked here, and how many of them can be used yet. */
  picked: number;
  ready: number;
  /** True when the library already holds photos or clips from before. */
  hasLibrary: boolean;
  onChoose(): void;
  onMakeVideo(): void;
  onArrangeMyself(): void;
  onUseLibrary(): void;
}

/**
 * Sits on the preview while the video is empty, so a first-time user always
 * sees the next step: choose photos, then one tap makes the video.
 */
export function StartCard({ picked, ready, hasLibrary, onChoose, onMakeVideo, onArrangeMyself, onUseLibrary }: StartCardProps) {
  const waiting = picked > 0 && ready < picked;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm">
      <section
        aria-label="Get started"
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center shadow-lg"
      >
        {picked === 0 ? (
          <>
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
              <ImagePlus className="size-5" />
            </span>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Let&apos;s make your video</h2>
              <p className="text-sm text-muted-foreground">Choose the photos and clips you want in it.</p>
            </div>
            <Button size="lg" className="h-11 w-full text-base" onClick={onChoose}>
              <ImagePlus className="size-5" />
              Choose photos &amp; videos
            </Button>
            {hasLibrary && (
              <Button variant="ghost" size="sm" className="h-10 w-full" onClick={onUseLibrary}>
                Use ones I&apos;ve already added
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
              {waiting ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
            </span>
            <div className="space-y-1">
              <h2 className="text-base font-semibold" role="status">
                {waiting
                  ? `Getting your ${picked === 1 ? "file" : "files"} ready… (${ready} of ${picked})`
                  : picked === 1
                    ? "1 photo or clip picked"
                    : `${picked} photos and clips picked`}
              </h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll put them in order with music, a title and smooth transitions. You can change anything after.
              </p>
            </div>
            <Button size="lg" className="h-11 w-full text-base" disabled={waiting} onClick={onMakeVideo}>
              <Wand2 className="size-5" />
              Make my video
            </Button>
            <Button variant="ghost" size="sm" className="h-10 w-full" disabled={waiting} onClick={onArrangeMyself}>
              I&apos;ll arrange them myself
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
