"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

const SupabaseStudio = dynamic(
  () => import("@/app/editor/[id]/supabase-studio").then((m) => m.SupabaseStudio),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-svh flex-col">
        <Skeleton className="h-12 w-full rounded-none" />
        <div className="flex flex-1">
          <Skeleton className="hidden h-full w-72 rounded-none sm:block" />
          <Skeleton className="h-full flex-1 rounded-none" />
        </div>
      </div>
    ),
  },
);

export function StudioClient({ projectId }: { projectId: string }) {
  return <SupabaseStudio projectId={projectId} />;
}
