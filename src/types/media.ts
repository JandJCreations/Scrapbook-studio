export type MediaType = "image" | "video" | "audio";

export type MediaStatus = "processing" | "ready" | "error";

export interface MediaFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  duration: number | null;
  folderId: string | null;
  createdAt: string;
  status: MediaStatus;
  progress: number;
  /** While processing: waiting its turn, being made smaller to fit, sending, or being saved. */
  stage?: "waiting" | "shrinking" | "uploading" | "saving";
  error?: string;
  /** After an error: true when this session still has the file, so the upload can be tried again. */
  retryable?: boolean;
  /** After an error: the connection dropped, so the upload is tried again by itself when the page is back in view or online. */
  connectionLost?: boolean;
  /** Where the file is on this computer, while it is uploading and for the rest of the session: it plays from here at once. */
  localUrl?: string;
}
