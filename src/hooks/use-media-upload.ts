"use client";

import { useMediaStore } from "@/store/use-media-store";

/** Uploads picked or dropped files; a pick that's too big is trimmed (and the user told) by the store. */
export function useMediaUpload(folderId: string | null) {
  const addFiles = useMediaStore((s) => s.addFiles);

  return function handleFiles(fileList: FileList | File[] | null, folderOverride?: string | null) {
    if (!fileList || fileList.length === 0) return;
    addFiles(Array.from(fileList), folderOverride === undefined ? folderId : folderOverride);
  };
}
