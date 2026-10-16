import type { TimelineProject } from "@/types/timeline";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MediaRow {
  id: string;
  type: "image" | "video" | "audio";
  storage_path: string;
  thumbnail_path: string | null;
}

export interface ResolvedMedia {
  type: MediaRow["type"];
  url: string;
  posterUrl: string | null;
}

export type MediaUrlMap = Map<string, ResolvedMedia>;

export interface MediaUrlDeps {
  fetchMediaRows(ids: string[]): Promise<MediaRow[]>;
  getSignedUrls(paths: string[]): Promise<Map<string, string>>;
}

/**
 * Unique media ids that live in Storage. Bundled stickers and template assets
 * use non-UUID ids and are resolved elsewhere.
 */
export function collectMediaIds(project: TimelineProject): string[] {
  const ids = new Set<string>();
  for (const clip of project.clips) {
    if (clip.mediaId && UUID_RE.test(clip.mediaId)) ids.add(clip.mediaId);
  }
  return Array.from(ids);
}

/**
 * Looks up fresh signed URLs. Signed URLs expire, so these are never part of
 * the saved document. Media that cannot be resolved is simply absent from the
 * map; the caller shows a placeholder.
 */
export async function resolveMediaUrls(ids: string[], deps: MediaUrlDeps): Promise<MediaUrlMap> {
  const resolved: MediaUrlMap = new Map();
  if (ids.length === 0) return resolved;

  const rows = await deps.fetchMediaRows(ids);
  const paths = rows.flatMap((row) =>
    [row.storage_path, row.thumbnail_path].filter((p): p is string => Boolean(p)),
  );
  const signed = await deps.getSignedUrls(paths);

  for (const row of rows) {
    const url = signed.get(row.storage_path);
    if (!url) continue;
    const posterUrl = row.thumbnail_path ? (signed.get(row.thumbnail_path) ?? null) : null;
    resolved.set(row.id, { type: row.type, url, posterUrl });
  }
  return resolved;
}
