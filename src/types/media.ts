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
  error?: string;
  /** Where the file is on this computer, while it is uploading and for the rest of the session: it plays from here at once. */
  localUrl?: string;
}
