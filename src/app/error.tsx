"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <div className="flex h-svh flex-col items-center justify-center bg-muted/20 p-6">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="This screen hit an unexpected error. Your work autosaves as you go, so nothing should be lost — try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
