"use client";

import * as React from "react";

import type { StudioEnv } from "@/components/studio/studio-env";
import { StudioView } from "@/components/studio/studio-view";
import { Button } from "@/components/ui/button";
import { getFfmpeg } from "@/lib/export/ffmpeg-client";
import { readMediaInfo } from "@/lib/playback/browser";
import { createObjectUrlRegistry } from "@/lib/playback/object-url-registry";
import { generateSampleClip, SAMPLE_CLIPS } from "@/lib/playback/sample-clips";
import type { MediaUrlSource } from "@/lib/sync/media-url-store";
import { createMemoryTimelineStorage } from "@/lib/sync/memory-timeline-storage";
import { makeToneWav } from "@/lib/timeline-ui/tone-wav";
import { createId } from "@/lib/timeline/ids";
import type { MediaItem, MediaType } from "@/types/media";

function typeOf(file: Blob): MediaType | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

/** The studio against memory and local files: no login, no database. */
export function StudioDev() {
  const registry = React.useMemo(() => createObjectUrlRegistry(), []);
  const storage = React.useMemo(() => createMemoryTimelineStorage(), []);
  const [library, setLibrary] = React.useState<MediaItem[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      registry.revokeAll();
    };
  }, [registry]);

  // Ids here are not UUIDs, so the studio never asks Storage for them.
  const media = React.useMemo<MediaUrlSource>(
    () => ({
      urlFor: (id) => registry.urlFor(id),
      posterFor: () => null,
      ensure: async () => {},
      subscribe: () => () => {},
      getVersion: () => 0,
    }),
    [registry],
  );

  async function addBlob(blob: Blob, name: string) {
    const type = typeOf(blob);
    if (!type) {
      if (aliveRef.current) setNote(`Unsupported file type: ${blob.type || name}`);
      return;
    }
    const id = createId();
    const url = registry.addBlob(id, blob);
    let duration: number | null = null;
    try {
      duration = type === "image" ? null : (await readMediaInfo(url, type)).duration;
    } catch {
      registry.remove(id);
      if (aliveRef.current) setNote(`Couldn't read ${name}.`);
      return;
    }
    if (!aliveRef.current) return;
    setLibrary((items) => [
      {
        id,
        name,
        type,
        mimeType: blob.type,
        size: blob.size,
        url,
        thumbnailUrl: type === "image" ? url : null,
        duration,
        folderId: null,
        createdAt: new Date().toISOString(),
        status: "ready",
        progress: 100,
      },
      ...items,
    ]);
  }

  async function addSamples() {
    setBusy(true);
    try {
      setNote("Loading FFmpeg (one-time download of about 30 MB)…");
      const ffmpeg = await getFfmpeg();
      for (const spec of SAMPLE_CLIPS) {
        if (!aliveRef.current) return;
        setNote(`Generating ${spec.name}…`);
        await addBlob(await generateSampleClip(ffmpeg, spec), spec.name);
      }
      if (aliveRef.current) setNote(null);
    } catch (error) {
      if (aliveRef.current) {
        setNote(error instanceof Error ? error.message : "Could not generate the sample clips.");
      }
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  const env: StudioEnv = {
    projectId: "studio-dev",
    projectName: "Studio harness",
    backHref: "/",
    storage,
    media,
    library,
    libraryLoading: false,
    saveFrame: async () => {},
    uploadFiles: (files) => {
      for (const file of files) void addBlob(file, file.name);
    },
  };

  return (
    <div className="flex h-svh flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1 text-xs">
        <span className="font-medium">Developer harness</span>
        <Button size="xs" variant="secondary" disabled={busy} onClick={() => void addSamples()}>
          Add sample clips
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() =>
            void addBlob(
              new Blob([new Uint8Array(makeToneWav({ seconds: 6, hz: 330 }))], { type: "audio/wav" }),
              "Sample tone",
            )
          }
        >
          Add sample tone
        </Button>
        {note && <span className="text-muted-foreground">{note}</span>}
      </div>
      <div className="min-h-0 flex-1">
        <StudioView env={env} />
      </div>
    </div>
  );
}
