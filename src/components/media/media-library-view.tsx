"use client";

import * as React from "react";
import { ImagePlus, Search, TriangleAlert, Upload } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderSidebar } from "@/components/media/folder-sidebar";
import { MediaDropzone } from "@/components/media/media-dropzone";
import { MediaGrid } from "@/components/media/media-grid";
import { MediaList } from "@/components/media/media-list";
import { MediaToolbar } from "@/components/media/media-toolbar";
import { useMediaStore } from "@/store/use-media-store";
import { useMediaUiStore } from "@/store/use-media-ui-store";

export function MediaLibraryView() {
  const dropzoneRef = React.useRef<{ openFileDialog: () => void }>(null);
  const items = useMediaStore((s) => s.items);
  const loaded = useMediaStore((s) => s.loaded);
  const error = useMediaStore((s) => s.error);
  const fetchMedia = useMediaStore((s) => s.fetchMedia);
  const search = useMediaUiStore((s) => s.search);
  const viewMode = useMediaUiStore((s) => s.viewMode);
  const activeFolderId = useMediaUiStore((s) => s.activeFolderId);

  React.useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const scopedItems = items.filter((i) => i.folderId === activeFolderId);
  const filteredItems = scopedItems.filter((i) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (!loaded) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't load your media"
        description={error}
        action={
          <Button variant="outline" onClick={() => fetchMedia()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <MediaDropzone ref={dropzoneRef} className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Media Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All your photos, video, and audio in one place.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 sm:flex-row">
        <FolderSidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <MediaToolbar
            onUploadClick={() => dropzoneRef.current?.openFileDialog()}
          />

          {items.length === 0 ? (
            <EmptyState
              icon={ImagePlus}
              title="Upload your first files"
              description="Drag and drop photos, video, or audio anywhere on this page, or click upload to browse."
              action={
                <Button
                  className="gap-2"
                  onClick={() => dropzoneRef.current?.openFileDialog()}
                >
                  <Upload className="size-4" />
                  Upload files
                </Button>
              }
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={Search}
              compact
              title="No media found"
              description={
                search
                  ? `Nothing matches "${search}" in this folder.`
                  : "This folder is empty. Upload files or move some in."
              }
            />
          ) : viewMode === "grid" ? (
            <MediaGrid items={filteredItems} />
          ) : (
            <MediaList items={filteredItems} />
          )}
        </div>
      </div>
    </MediaDropzone>
  );
}
