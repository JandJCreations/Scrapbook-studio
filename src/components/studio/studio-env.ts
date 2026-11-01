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
  /** Present where the project has somewhere to keep a dashboard thumbnail. */
  saveThumbnail?(dataUrl: string): Promise<void>;
  /** Present when the Media tab may offer an upload button. */
  uploadFiles?(files: File[]): void;
}
