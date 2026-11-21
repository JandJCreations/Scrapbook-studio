"use client";

import * as React from "react";
import Link from "next/link";

import { useSupabaseStudioEnv } from "@/app/editor/[id]/supabase-env";
import { StudioView } from "@/components/studio/studio-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettingsStore } from "@/store/use-settings-store";

export function SupabaseStudio({ projectId }: { projectId: string }) {
  const { env, missing } = useSupabaseStudioEnv(projectId);
  // The export dialog starts from the export defaults chosen in Settings.
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  React.useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

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
