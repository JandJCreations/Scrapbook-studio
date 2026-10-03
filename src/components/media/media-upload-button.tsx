"use client";

import * as React from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { ACCEPTED_MEDIA_INPUT } from "@/lib/media/file-type";
import { cn } from "@/lib/utils";

interface MediaUploadButtonProps {
  folderId: string | null;
  className?: string;
  size?: "sm" | "default";
}

export function MediaUploadButton({ folderId, className, size = "sm" }: MediaUploadButtonProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleFiles = useMediaUpload(folderId);

  return (
    <>
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
      <Button
        type="button"
        size={size}
        variant="outline"
        className={cn("gap-2", className)}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        Upload
      </Button>
    </>
  );
}
