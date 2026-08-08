"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";

import { ACCEPTED_MEDIA_INPUT } from "@/lib/media/file-type";
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
    addFiles(Array.from(fileList), activeFolderId);
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
