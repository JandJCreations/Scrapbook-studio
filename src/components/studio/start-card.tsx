"use client";

import * as React from "react";
import { FolderUp, ImagePlus, Loader2, Wand2 } from "lucide-react";

import { AlbumTip } from "@/components/media/album-tip";

import { Button } from "@/components/ui/button";

interface StartCardProps {
  /** Photos and clips the user just picked here, and how many of them can be used yet. */
  picked: number;
  ready: number;
  /** True when the library already holds photos or clips from before. */
  hasLibrary: boolean;
  onChoose(): void;
  /** Present where a whole folder (an album saved on the computer) can be picked. */
  onChooseFolder?(): void;
  onMakeVideo(): void;
  onArrangeMyself(): void;
  onUseLibrary(): void;
}

/**
 * Sits on the preview while the video is empty, so a first-time user always
 * sees the next step: choose photos, then one tap makes the video.
 */
export function StartCard({ picked, ready, hasLibrary, onChoose, onChooseFolder, onMakeVideo, onArrangeMyself, onUseLibrary }: StartCardProps) {
  const waiting = picked > 0 && ready < picked;
  return (
    // m-auto (not items-center) keeps the top of the card reachable when a phone's short preview makes it scroll.
    <div className="absolute inset-0 z-10 flex overflow-y-auto bg-background/85 p-3 backdrop-blur-sm sm:p-4">
      <section
        aria-label="Get started"
        className="m-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border bg-card p-4 text-center shadow-lg sm:p-5"
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
            {onChooseFolder && (
              // Computers only: a phone's albums live in its photo picker, which the tip below explains.
              <Button variant="outline" size="sm" className="h-10 w-full gap-1.5 pointer-coarse:hidden" onClick={onChooseFolder}>
                <FolderUp className="size-4" aria-hidden />
                Choose a whole folder
              </Button>
            )}
            <AlbumTip className="hidden pointer-coarse:block" button="Choose photos & videos" />
            {hasLibrary && (
              <Button variant="ghost" size="sm" className="h-10 w-full" onClick={onUseLibrary}>
                Use ones I&apos;ve already added
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary [@media(max-height:760px)]:hidden" aria-hidden>
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
              <p className="text-sm text-muted-foreground [@media(max-height:760px)]:hidden">
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
            <Button variant="link" size="sm" className="h-10" onClick={onChoose}>
              <ImagePlus className="size-4" />
              Add more photos
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
