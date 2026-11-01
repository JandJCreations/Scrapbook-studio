import type { CustomFont } from "@/lib/fonts/custom-fonts";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import type { MediaItem } from "@/types/media";

/**
 * Everything the editor needs from its surroundings. The real route fills it
 * from Supabase; the developer harness fills it from memory and local files.
 * StudioView never imports Supabase itself.
 */
export interface StudioEnv {
  projectId: string;
  projectName: string;
  backHref: string;
  storage: TimelineStorage;
  media: MediaUrlSource;
  /** The user's media library, for the Media tab. */
  library: MediaItem[];
  libraryLoading: boolean;
  saveFrame(frame: FrameSize): Promise<void>;
  /** Show the welcome tour the first time the editor is opened. */
  welcomeTour?: boolean;
  /** True when the project already has a dashboard thumbnail, so opening it need not redraw one. */
  hasThumbnail?: boolean;
  /** Present where the project has somewhere to keep a dashboard thumbnail. */
  saveThumbnail?(dataUrl: string): Promise<void>;
  /** Present where the user may bring their own fonts: the ones they have, and a way to add one. */
  customFonts?: { fonts: CustomFont[]; add(file: File): Promise<void> };
  /** Present when the Media tab may offer an upload button. */
  uploadFiles?(files: File[]): void;
}
