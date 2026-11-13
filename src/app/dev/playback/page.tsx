import { notFound } from "next/navigation";

import { PlaybackClient } from "@/app/dev/playback/playback-client";

// A developer test page for the playback engine: never served in production.
export default function PlaybackPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PlaybackClient />;
}
