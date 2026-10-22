"use client";

import dynamic from "next/dynamic";

// Konva and media elements need the browser, so the view is client-only.
const PlaybackHarness = dynamic(
  () => import("@/components/playback/playback-harness").then((m) => m.PlaybackHarness),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-muted-foreground">Loading the playback test page…</p>,
  },
);

export function PlaybackClient() {
  return <PlaybackHarness />;
}
