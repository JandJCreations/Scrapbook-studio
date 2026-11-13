"use client";

import dynamic from "next/dynamic";

// Konva and media elements need the browser, so the view is client-only.
const StudioDev = dynamic(() => import("@/app/dev/studio/studio-dev").then((m) => m.StudioDev), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading the studio harness…</p>,
});

export function StudioDevClient() {
  return <StudioDev />;
}
