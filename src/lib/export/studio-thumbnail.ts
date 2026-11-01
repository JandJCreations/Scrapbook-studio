import { createFrameRenderer } from "@/lib/export/studio-frame-renderer";
import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineProject } from "@/types/timeline";

export const THUMBNAIL_WIDTH = 480;

export interface ThumbnailRequest {
  project: TimelineProject;
  frame: FrameSize;
  urlFor(mediaId: string): string | null;
  /** The moment of the project to show, in timeline seconds. */
  time: number;
}

/** Draws one moment of the project off screen, as a small JPEG data URL. */
export async function renderThumbnail({ project, frame, urlFor, time }: ThumbnailRequest): Promise<string> {
  const renderer = createFrameRenderer({ project, frame, urlFor, background: "#000000" });
  try {
    await renderer.prepare();
    await renderer.renderAt(time);
    return renderer.capture({ width: Math.min(THUMBNAIL_WIDTH, frame.width), mimeType: "image/jpeg", quality: 0.8 });
  } finally {
    renderer.dispose();
  }
}
