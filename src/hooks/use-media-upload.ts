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
      toast.error(
        `You selected ${files.length} files — the limit is ${MAX_FILES_PER_UPLOAD} per upload. Select ${MAX_FILES_PER_UPLOAD} or fewer and try again.`,
      );
      return;
    }
    addFiles(files, folderId);
  };
}
