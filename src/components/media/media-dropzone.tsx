"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { ACCEPTED_MEDIA_INPUT, MAX_FILES_PER_UPLOAD } from "@/lib/media/file-type";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/store/use-media-store";
import { useMediaUiStore } from "@/store/use-media-ui-store";

interface MediaDropzoneProps {
  children: React.ReactNode;
  className?: string;
}

export const MediaDropzone = React.forwardRef<
  { openFileDialog: () => void },
  MediaDropzoneProps
>(function MediaDropzone({ children, className }, ref) {
  const [isDragging, setIsDragging] = React.useState(false);
  const dragCounter = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const addFiles = useMediaStore((s) => s.addFiles);
  const activeFolderId = useMediaUiStore((s) => s.activeFolderId);

  React.useImperativeHandle(ref, () => ({
    openFileDialog: () => inputRef.current?.click(),
  }));

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (files.length > MAX_FILES_PER_UPLOAD) {
      toast.info(
        `Uploading the first ${MAX_FILES_PER_UPLOAD} files — select the rest in a separate batch.`,
      );
    }
    addFiles(files.slice(0, MAX_FILES_PER_UPLOAD), activeFolderId);
  }

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_MEDIA_INPUT}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {children}

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
          <UploadCloud className="size-10 text-primary" />
          <p className="text-sm font-medium text-primary">
            Drop files to upload
          </p>
        </div>
      )}
    </div>
  );
});
