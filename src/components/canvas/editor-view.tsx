"use client";

import * as React from "react";
import Link from "next/link";
import { FileQuestion, TriangleAlert } from "lucide-react";

import { CanvasStage } from "@/components/canvas/canvas-stage";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { EditorSidebar } from "@/components/canvas/editor-sidebar";
import { PhotoEditPanel } from "@/components/canvas/photo-edit-panel";
import { SelectionToolbar } from "@/components/canvas/selection-toolbar";
import { TextEditOverlay } from "@/components/canvas/text-edit-overlay";
import { TextEditPanel } from "@/components/canvas/text-edit-panel";
import { VideoEditPanel } from "@/components/canvas/video-edit-panel";
import { AudioClipPanel } from "@/components/timeline/audio-clip-panel";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useElementSize } from "@/hooks/use-element-size";
import { useProjectContentSync } from "@/hooks/use-project-content-sync";
import { useAudioClips, useAudioStore } from "@/store/use-audio-store";
import { useCanvasObjects, useCanvasStore } from "@/store/use-canvas-store";
import { useProjectStore } from "@/store/use-project-store";

export function EditorView({ projectId }: { projectId: string }) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const project = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const projectsLoaded = useProjectStore((s) => s.loaded);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const { contentLoaded, loadError, retryLoad } = useProjectContentSync(projectId);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const objects = useCanvasObjects(projectId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const removeObjects = useCanvasStore((s) => s.removeObjects);
  const duplicateObjects = useCanvasStore((s) => s.duplicateObjects);

  const audioClips = useAudioClips(projectId);
  const selectedClipId = useAudioStore((s) => s.selectedClipId);
  const selectedClip = audioClips.find((c) => c.id === selectedClipId);

  const selectedObject =
    selectedIds.length === 1
      ? objects.find((o) => o.id === selectedIds[0])
      : undefined;
  const showPhotoPanel = !selectedClip && selectedObject?.type === "image";
  const showVideoPanel = !selectedClip && selectedObject?.type === "video";
  const showTextPanel = !selectedClip && selectedObject?.type === "text";

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (selectedIds.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeObjects(projectId, selectedIds);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setSelectedIds(duplicateObjects(projectId, selectedIds));
      } else if (e.key === "Escape") {
        setSelectedIds([]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectId, selectedIds, removeObjects, duplicateObjects, setSelectedIds]);

  if (project && loadError) {
    return (
      <div className="flex h-svh flex-col items-center justify-center bg-muted/20 p-6">
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load this scrapbook"
          description="We couldn't reach the server to load your content. Nothing was lost — retry when you're ready."
          action={<Button onClick={retryLoad}>Try again</Button>}
        />
      </div>
    );
  }

  if (!projectsLoaded || (project && !contentLoaded)) {
    return (
      <div className="flex h-svh flex-col">
        <Skeleton className="h-14 w-full rounded-none" />
        <div className="flex flex-1">
          <Skeleton className="hidden h-full w-64 rounded-none lg:block" />
          <Skeleton className="h-full flex-1 rounded-none" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-svh flex-col items-center justify-center bg-muted/20 p-6">
        <EmptyState
          icon={FileQuestion}
          title="Project not found"
          description="This scrapbook doesn't exist or may have been deleted."
          action={
            <Button asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col bg-muted/20">
      <CanvasToolbar
        projectId={projectId}
        projectName={project.name}
        stageWidth={size.width}
        stageHeight={size.height}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <EditorSidebar
            projectId={projectId}
            stageWidth={size.width}
            stageHeight={size.height}
          />
          <div ref={ref} className="relative min-w-0 flex-1 overflow-hidden">
            {size.width > 0 && size.height > 0 && (
              <CanvasStage
                projectId={projectId}
                width={size.width}
                height={size.height}
              />
            )}
            <TextEditOverlay projectId={projectId} />
            <SelectionToolbar projectId={projectId} />
          </div>
          {showPhotoPanel && selectedObject && (
            <PhotoEditPanel projectId={projectId} object={selectedObject} />
          )}
          {showVideoPanel && selectedObject && (
            <VideoEditPanel projectId={projectId} object={selectedObject} />
          )}
          {showTextPanel && selectedObject && (
            <TextEditPanel projectId={projectId} object={selectedObject} />
          )}
          {selectedClip && (
            <AudioClipPanel projectId={projectId} clip={selectedClip} />
          )}
        </div>
        <TimelinePanel projectId={projectId} />
      </div>
    </div>
  );
}
