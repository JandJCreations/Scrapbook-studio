"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Opening the native photo picker backgrounds the page; when this button
  // lives inside the mobile Panels sheet (a Radix Dialog), returning from
  // the picker can get misread as an outside interaction and close the
  // sheet — which unmounts this component before the input's change event
  // arrives, so the selection is silently lost. Portaling the actual input
  // straight onto <body>, independent of whatever sheet/dialog triggered
  // it, keeps it alive regardless of what the sheet does around it.
  const input = (
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
  );

  return (
    <>
      {mounted ? createPortal(input, document.body) : input}
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
