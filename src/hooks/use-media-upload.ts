"use client";

import { toast } from "sonner";

import { MAX_FILES_PER_UPLOAD } from "@/lib/media/file-type";
import { useMediaStore } from "@/store/use-media-store";

export function useMediaUpload(folderId: string | null) {
  const addFiles = useMediaStore((s) => s.addFiles);

  return function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (files.length > MAX_FILES_PER_UPLOAD) {
      toast.info(
        `Uploading the first ${MAX_FILES_PER_UPLOAD} files — select the rest in a separate batch.`,
      );
    }
    addFiles(files.slice(0, MAX_FILES_PER_UPLOAD), folderId);
  };
}
