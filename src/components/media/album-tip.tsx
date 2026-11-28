import { MAX_FILES_PER_UPLOAD } from "@/lib/media/file-type";
import { cn } from "@/lib/utils";

/**
 * How to bring in a whole album from a phone. A web page can't ask the
 * iPhone's photo picker for an album by name: it only ever gets the photos
 * the user ticks. The picker does let you open an album and tick a whole run
 * of photos with one slide of a finger, so this says how.
 */
/** `button` is the label of the button that opens the picker where the tip sits. */
export function AlbumTip({ className, button = "Import" }: { className?: string; button?: string }) {
  return (
    <details className={cn("w-full text-left text-xs text-muted-foreground", className)}>
      <summary className="cursor-pointer py-1 text-center font-medium text-foreground underline-offset-2 hover:underline">
        Adding a whole album?
      </summary>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        <li>
          Tap <span className="font-medium text-foreground">{button}</span>, then{" "}
          <span className="font-medium text-foreground">Photo Library</span>.
        </li>
        <li>
          At the top, switch to <span className="font-medium text-foreground">Albums</span> (called{" "}
          <span className="font-medium text-foreground">Collections</span> on newer iPhones) and open the album.
        </li>
        <li>Put your finger on the first photo and slide across and down: every photo you pass gets ticked.</li>
        <li>
          Tap <span className="font-medium text-foreground">Add</span> (or Done). Up to {MAX_FILES_PER_UPLOAD} come in at a time.
        </li>
      </ol>
      <p className="mt-1">Your phone only lets websites have the photos you tick, so there&apos;s no one-tap album button.</p>
    </details>
  );
}
