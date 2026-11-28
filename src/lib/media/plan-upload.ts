import { MAX_UPLOAD_BYTES, formatMegabytes } from "@/lib/supabase/storage";

import { detectMediaType, MAX_FILES_PER_UPLOAD } from "@/lib/media/file-type";

/**
 * All the space the account's file storage has. Supabase's free plan gives
 * 1 GB in total, and going over it can get the whole project restricted, so
 * a big pick stops short of it. A paid plan raises it with
 * NEXT_PUBLIC_STORAGE_LIMIT_MB.
 */
export const STORAGE_LIMIT_BYTES = Number(process.env.NEXT_PUBLIC_STORAGE_LIMIT_MB || 1024) * 1024 * 1024;

export interface UploadPlan {
  /** The files to upload, in the order they were picked. */
  accepted: File[];
  /** Files that aren't photos, videos or songs (a folder's notes, sidecar files, hidden system files). */
  notMedia: number;
  /** Files past the most one pick can take. */
  overCount: number;
  /** Files left out because the storage space would run out. */
  overSpace: number;
}

export interface UploadLimits {
  /** Bytes already used in storage, or null when not known (the space check is then skipped). */
  usedBytes: number | null;
  limitBytes?: number;
  maxFiles?: number;
}

/** About how much a file takes once saved: a video over the per-file limit is made smaller first. */
function savedSize(file: File): number {
  return detectMediaType(file) === "video" ? Math.min(file.size, MAX_UPLOAD_BYTES) : file.size;
}

/** Hidden files a folder carries along: .DS_Store, ._IMG_0001.JPG from a Mac, Thumbs.db and desktop.ini from Windows. */
function isSystemFile(file: File): boolean {
  return file.name.startsWith(".") || /^(thumbs\.db|desktop\.ini)$/i.test(file.name);
}

/**
 * Takes as many of the picked files as can be handled: photos, videos and
 * songs only, no more than one pick can take, and no more than the space
 * left. Whatever is left out is counted, so the user can be told.
 */
export function planUpload(files: File[], limits: UploadLimits): UploadPlan {
  const maxFiles = limits.maxFiles ?? MAX_FILES_PER_UPLOAD;
  const limitBytes = limits.limitBytes ?? STORAGE_LIMIT_BYTES;
  let spaceLeft = limits.usedBytes === null ? Infinity : limitBytes - limits.usedBytes;
  const plan: UploadPlan = { accepted: [], notMedia: 0, overCount: 0, overSpace: 0 };
  for (const file of files) {
    if (isSystemFile(file) || !detectMediaType(file)) {
      plan.notMedia += 1;
      continue;
    }
    if (plan.accepted.length >= maxFiles) {
      plan.overCount += 1;
      continue;
    }
    const size = savedSize(file);
    // Smaller files further on can still fit after a big one doesn't.
    if (size > spaceLeft) {
      plan.overSpace += 1;
      continue;
    }
    spaceLeft -= size;
    plan.accepted.push(file);
  }
  return plan;
}

/** One friendly sentence about what was left out, or null when everything was taken. */
export function describeSkipped(plan: UploadPlan, limitBytes: number = STORAGE_LIMIT_BYTES): string | null {
  const parts: string[] = [];
  const files = (n: number) => (n === 1 ? "1 file" : `${n} files`);
  if (plan.overCount > 0) {
    parts.push(`${files(plan.overCount)} past the ${MAX_FILES_PER_UPLOAD} you can add at once (pick them again after these finish)`);
  }
  if (plan.overSpace > 0) {
    parts.push(`${files(plan.overSpace)} that won't fit in your ${formatSpace(limitBytes)} of storage`);
  }
  if (plan.notMedia > 0) {
    parts.push(`${files(plan.notMedia)} that ${plan.notMedia === 1 ? "isn't a photo, video or song" : "aren't photos, videos or songs"}`);
  }
  if (parts.length === 0) return null;
  const taken = plan.accepted.length;
  const head = taken === 0 ? "Nothing was added. Skipped" : `Adding ${taken === 1 ? "1 file" : `${taken} files`}. Skipped`;
  return `${head} ${parts.join(", and ")}.`;
}

/** 1 GB rather than 1024 MB. */
export function formatSpace(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  return formatMegabytes(bytes);
}
