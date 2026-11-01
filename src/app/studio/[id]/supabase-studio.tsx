"use client";

import Link from "next/link";

import { useSupabaseStudioEnv } from "@/app/studio/[id]/supabase-env";
import { StudioView } from "@/components/studio/studio-view";
import { Skeleton } from "@/components/ui/skeleton";

export function SupabaseStudio({ projectId }: { projectId: string }) {
  const { env, missing } = useSupabaseStudioEnv(projectId);

  if (missing) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm">Project not found.</p>
        <Link href="/dashboard" className="text-sm underline">
          Back to your projects
        </Link>
      </div>
    );
  }
  if (!env) {
    return (
      <div className="flex h-svh flex-col">
        <Skeleton className="h-12 w-full rounded-none" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    );
  }
  return (
    <div className="h-svh">
      <StudioView env={env} />
    </div>
  );
}
