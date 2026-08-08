"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

const EditorView = dynamic(
  () => import("@/components/canvas/editor-view").then((m) => m.EditorView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-svh flex-col">
        <Skeleton className="h-14 w-full rounded-none" />
        <div className="flex flex-1">
          <Skeleton className="hidden h-full w-64 rounded-none sm:block" />
          <Skeleton className="h-full flex-1 rounded-none" />
        </div>
      </div>
    ),
  },
);

export function EditorClient({ projectId }: { projectId: string }) {
  return <EditorView projectId={projectId} />;
}
