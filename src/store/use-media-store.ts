import { create } from "zustand";

import {
  generateImageThumbnail,
  generateImageThumbnailFromFile,
  generateVideoThumbnail,
  getAudioDuration,
} from "@/lib/media/generate-thumbnail";
import { detectMediaType, friendlyMediaName, mimeTypeFor } from "@/lib/media/file-type";
import { PhotoFormatError, preparePhoto } from "@/lib/media/prepare-photo";
import { shrinkVideo, ShrinkError } from "@/lib/media/shrink-video";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  dataUrlToBlob,
  formatMegabytes,
  getSignedUrl,
  getSignedUrls,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  safeFileName,
  uploadWithProgress,
} from "@/lib/supabase/storage";
import type { MediaFolder, MediaItem, MediaType } from "@/types/media";
import { ConnectionLostError } from "@/lib/supabase/storage";

type MediaItemRow = Database["public"]["Tables"]["media_items"]["Row"];
type MediaFolderRow = Database["public"]["Tables"]["media_folders"]["Row"];

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function storagePathFor(userId: string, itemId: string, filename: string) {
  return `${userId}/media/${itemId}/${filename}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Uploading many files (e.g. a big batch picked from a phone's photo
// library) all at once saturates the connection and floods the UI with
// simultaneous progress updates, which on mobile shows up as lag/freezing.
// Capping concurrency keeps memory and re-render pressure bounded — 5 still
// only ever has a handful of items updating at once (each update() is one
// lightweight patch to one array entry, not a heavy re-render), while
// finishing a large batch noticeably faster than 3 did.
const UPLOAD_CONCURRENCY = 5;

function thumbnailPathFor(userId: string, itemId: string) {
  return `${userId}/media/${itemId}/thumb.jpg`;
}

function rowToFolder(row: MediaFolderRow): MediaFolder {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

interface MediaStore {
  items: MediaItem[];
  folders: MediaFolder[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchMedia: () => Promise<void>;
  backfillMissingThumbnails: () => void;
  addFiles: (files: File[], folderId: string | null) => string[];
  /** Tries a failed upload again, while this session still holds its file. */
  retryUpload: (id: string) => void;
  /** Tries again every upload that failed because the connection dropped (the phone locked, Safari went to the background, the signal went). */
  retryLostUploads: () => void;
  deleteItem: (id: string) => void;
  deleteItems: (ids: string[]) => void;
  renameItem: (id: string, name: string) => void;
  moveItem: (id: string, folderId: string | null) => void;
  moveItems: (ids: string[], folderId: string | null) => void;
  createFolder: (name: string) => MediaFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
}

/** The files picked in this session that haven't been saved yet, so a failed upload can be tried again. */
const pendingFiles = new Map<string, File>();

/** Pictures are made a couple at a time, ahead of the upload queue, so every tile shows its photo within moments. */
const runThumbnail = createLimiter(2);
const runUpload = createLimiter(UPLOAD_CONCURRENCY);
const runShrink = createLimiter(1);
/** Big photos are redrawn one at a time: a phone has little memory to spare. */
const runPhoto = createLimiter(1);

function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

interface Preview {
  thumbnailBlob: Blob | null;
  duration: number | null;
}

async function makePreview(type: MediaType, file: File, localUrl: string): Promise<Preview> {
  if (type === "video") {
    const result = await withTimeout(generateVideoThumbnail(localUrl), 20000).catch(() => null);
    return { thumbnailBlob: result ? dataUrlToBlob(result.thumbnailUrl) : null, duration: result?.duration ?? null };
  }
  if (type === "audio") {
    return { thumbnailBlob: null, duration: await withTimeout(getAudioDuration(localUrl), 20000).catch(() => 0) };
  }
  const thumbnailBlob = await withTimeout(generateImageThumbnailFromFile(file, localUrl), 20000).catch(() => null);
  return { thumbnailBlob, duration: null };
}

async function uploadBlob(path: string, body: Blob, contentType: string, onProgress: (fraction: number) => void) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("You were signed out. Sign in again and retry.");
  await uploadWithProgress(
    {
      baseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      accessToken: session.access_token,
      path,
      body,
      contentType,
    },
    onProgress,
  );
}

/**
 * Whether an upload failed because the connection went (signal lost, or an
 * iPhone pausing the page) rather than being refused: those are tried again
 * by themselves. A fetch that couldn't reach the server throws a TypeError.
 */
function isConnectionLoss(err: unknown): boolean {
  if (err instanceof ConnectionLostError || err instanceof TypeError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof Error && /failed to fetch|load failed|network ?error|networkerror/i.test(err.message);
}

/**
 * Who is uploading. Read from the session saved on this device, so it still
 * works with no signal (asking the server would fail, and wrongly say
 * "signed out"); the upload itself checks the session with the server.
 */
async function currentUser(): Promise<{ id: string; problem?: never } | { id?: never; problem: Partial<MediaItem> }> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  try {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (session?.user) return { id: session.user.id };
  } catch {
    // Treated like no session below.
  }
  return {
    problem: offline
      ? { status: "error", stage: undefined, retryable: true, connectionLost: true, error: "No internet connection. It will carry on when you're back online." }
      : { status: "error", stage: undefined, retryable: true, error: "You were signed out. Sign in again and retry." },
  };
}

/** Keeps the new ending (".jpg") on the name the user sees. */
function renamedLike(shown: string, saved: string): string {
  const ext = saved.slice(saved.lastIndexOf("."));
  const dot = shown.lastIndexOf(".");
  return (dot === -1 ? shown : shown.slice(0, dot)) + ext;
}

async function processMediaItem(
  userId: string,
  item: MediaItem,
  file: File,
  update: (id: string, patch: Partial<MediaItem>) => void,
) {
  const type = detectMediaType(file);

  if (!type) {
    pendingFiles.delete(item.id);
    update(item.id, {
      status: "error",
      error: "This kind of file can't be used. Try a photo, video or song.",
      progress: 0,
      stage: undefined,
      retryable: false,
    });
    return;
  }

  const supabase = createClient();
  // The file is usually already held locally (addFiles); one made here is ours to let go of.
  let earlyThumbnail: string | null = null;
  let madeLocalUrl = item.localUrl === undefined;
  let localUrl = item.localUrl ?? URL.createObjectURL(file);

  try {
    if (type === "image") {
      // An iPhone HEIC becomes a JPEG and a huge photo is made smaller, before anything is sent.
      const original = file;
      try {
        file = await runPhoto(() => preparePhoto(original));
      } catch (err) {
        if (err instanceof PhotoFormatError) pendingFiles.delete(item.id);
        throw err;
      }
      if (file !== original) {
        if (pendingFiles.has(item.id)) pendingFiles.set(item.id, file);
        // The editor plays the JPEG from now on: every browser can show it.
        const nextUrl = URL.createObjectURL(file);
        if (madeLocalUrl) URL.revokeObjectURL(localUrl);
        else if (item.localUrl) setTimeout(() => URL.revokeObjectURL(item.localUrl!), 60000);
        localUrl = nextUrl;
        madeLocalUrl = false;
        update(item.id, { localUrl: nextUrl, name: renamedLike(item.name, file.name), mimeType: file.type, size: file.size });
        item = { ...item, localUrl: nextUrl, name: renamedLike(item.name, file.name) };
      }
    }

    // The picture first, outside the upload queue: the tile shows the photo while it waits its turn.
    const preview = await runThumbnail(() => makePreview(type, file, localUrl));
    if (preview.thumbnailBlob) {
      earlyThumbnail = URL.createObjectURL(preview.thumbnailBlob);
      update(item.id, { thumbnailUrl: earlyThumbnail, duration: preview.duration });
    } else if (preview.duration !== null) {
      update(item.id, { duration: preview.duration });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      if (type !== "video") {
        pendingFiles.delete(item.id);
        throw new Error(
          `Too big to save (${formatMegabytes(file.size)}). Each file can be up to ${formatMegabytes(MAX_UPLOAD_BYTES)}.`,
        );
      }
      // A long phone clip: re-encode it smaller here, one at a time (it keeps the computer busy), then save that.
      file = await runShrink(async () => {
        update(item.id, { stage: "shrinking", progress: 0 });
        let shown = 0;
        try {
          return await shrinkVideo(file, MAX_UPLOAD_BYTES, (fraction) => {
            const percent = Math.floor(fraction * 100);
            // A second, smaller pass starts again from 0.
            if (Math.abs(percent - shown) >= 2) {
              shown = percent;
              update(item.id, { progress: percent });
            }
          });
        } catch (err) {
          if (err instanceof ShrinkError) pendingFiles.delete(item.id);
          throw err instanceof ShrinkError ? err : new Error("Couldn't make this video smaller. Try again, or trim it first.");
        }
      });
      // A retry after this point sends the smaller copy instead of making it again.
      if (pendingFiles.has(item.id)) pendingFiles.set(item.id, file);
      update(item.id, { stage: "waiting", progress: 0, size: file.size, mimeType: file.type });
    }

    await runUpload(async () => {
      // Removed from the library while it waited: nothing to send.
      if (!pendingFiles.has(item.id)) return;
      update(item.id, { stage: "uploading", progress: 0 });
      const storagePath = storagePathFor(userId, item.id, safeFileName(file.name));
      const thumbnailPath = preview.thumbnailBlob ? thumbnailPathFor(userId, item.id) : null;

      // Progress ticks are kept to whole steps of 2%, so a big upload doesn't redraw the editor hundreds of times.
      let shown = 0;
      const total = file.size + (preview.thumbnailBlob?.size ?? 0);
      let thumbSent = 0;
      let fileSent = 0;
      const report = () => {
        const percent = Math.min(95, Math.floor(((fileSent + thumbSent) / Math.max(1, total)) * 95));
        if (percent - shown >= 2) {
          shown = percent;
          update(item.id, { progress: percent });
        }
      };

      await Promise.all([
        uploadBlob(storagePath, file, mimeTypeFor(file), (f) => {
          fileSent = f * file.size;
          report();
        }),
        preview.thumbnailBlob && thumbnailPath
          ? uploadBlob(thumbnailPath, preview.thumbnailBlob, "image/jpeg", (f) => {
              thumbSent = f * preview.thumbnailBlob!.size;
              report();
            })
          : Promise.resolve(),
      ]);
      update(item.id, { stage: "saving", progress: 96 });

      // No full-resolution fallback for a missing thumbnail: showing the
      // original at full size is the crash risk this was built to avoid. It
      // shows a placeholder and gets picked up by the next backfill pass.
      const [url, thumbnailUrl] = await Promise.all([
        getSignedUrl(storagePath),
        thumbnailPath ? getSignedUrl(thumbnailPath) : Promise.resolve(null),
      ]);

      const { error: insertError } = await supabase.from("media_items").insert({
        id: item.id,
        owner_id: userId,
        folder_id: item.folderId,
        name: item.name,
        type,
        mime_type: mimeTypeFor(file),
        size: file.size,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        duration: preview.duration,
        status: "ready",
      });
      if (insertError) throw insertError;

      // The thumbnail made on this computer gives way to the stored one.
      if (earlyThumbnail && thumbnailUrl) URL.revokeObjectURL(earlyThumbnail);
      pendingFiles.delete(item.id);
      update(item.id, {
        progress: 100,
        status: "ready",
        stage: undefined,
        url: url ?? "",
        thumbnailUrl: thumbnailUrl ?? earlyThumbnail,
        duration: preview.duration,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't upload this file. Try again.";
    update(item.id, {
      status: "error",
      stage: undefined,
      retryable: pendingFiles.has(item.id),
      connectionLost: isConnectionLoss(err),
      error: message,
    });
  } finally {
    if (madeLocalUrl) URL.revokeObjectURL(localUrl);
  }
}

export const useMediaStore = create<MediaStore>((set, get) => ({
  items: [],
  folders: [],
  loaded: false,
  loading: false,
  error: null,

  fetchMedia: async () => {
    if (get().loading || (get().loaded && !get().error)) return;
    set({ loading: true, error: null });

    const supabase = createClient();
    const [itemsRes, foldersRes] = await Promise.all([
      supabase.from("media_items").select("*").order("created_at", { ascending: false }),
      supabase.from("media_folders").select("*").order("created_at", { ascending: true }),
    ]);

    if (itemsRes.error) {
      set({ loading: false, loaded: true, error: itemsRes.error.message });
      return;
    }
    if (foldersRes.error) {
      set({ loading: false, loaded: true, error: foldersRes.error.message });
      return;
    }

    const rows = itemsRes.data ?? [];
    const paths = rows.flatMap((r) => [r.storage_path, r.thumbnail_path].filter((p): p is string => Boolean(p)));
    const signedUrls = await getSignedUrls(paths);

    const items: MediaItem[] = rows.map((row: MediaItemRow) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      mimeType: row.mime_type,
      size: row.size,
      url: signedUrls.get(row.storage_path) ?? "",
      // Deliberately does NOT fall back to the full-resolution storage_path
      // for images missing a thumbnail — loading dozens of multi-MB phone
      // photos at full size just to render a grid square is what crashes
      // the tab on mobile. Items without one show a placeholder until
      // backfillMissingThumbnails generates a real one.
      thumbnailUrl: row.thumbnail_path
        ? (signedUrls.get(row.thumbnail_path) ?? null)
        : null,
      duration: row.duration,
      folderId: row.folder_id,
      createdAt: row.created_at,
      status: row.status,
      progress: 100,
    }));

    // A file picked before the library finished loading is still uploading and is not in the list yet: keep it.
    const inFlight = get().items.filter((i) => i.status === "processing" && !items.some((loaded) => loaded.id === i.id));

    set({
      items: [...inFlight, ...items],
      folders: (foldersRes.data ?? []).map(rowToFolder),
      loading: false,
      loaded: true,
    });

    get().backfillMissingThumbnails();
  },

  // Photos uploaded before thumbnail generation existed have no
  // thumbnail_path, so they'd otherwise show a placeholder forever. Heals
  // them in the background, one at a time with a pause between each so
  // peak memory never exceeds "one photo's worth" regardless of library
  // size. Capped per call so a large backlog spreads across a few app
  // opens instead of front-loading all of it into a single session.
  backfillMissingThumbnails: () => {
    const BACKFILL_BATCH_LIMIT = 12;
    const targets = get()
      .items.filter((i) => i.type === "image" && i.status === "ready" && !i.thumbnailUrl && i.url)
      .slice(0, BACKFILL_BATCH_LIMIT);
    if (targets.length === 0) return;

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      for (const item of targets) {
        try {
          // A hung promise here (image generation has one confirmed cause
          // already — see generate-thumbnail.ts — and could plausibly have
          // others) would otherwise stall this entire sequential loop on
          // one photo forever, silently blocking every item after it too.
          const dataUrl = await withTimeout(generateImageThumbnail(item.url), 15000);
          const blob = dataUrlToBlob(dataUrl);
          const thumbnailPath = thumbnailPathFor(user.id, item.id);

          const { error: uploadError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(thumbnailPath, blob, { contentType: "image/jpeg", upsert: true });
          if (uploadError) continue;

          const { error: updateError } = await supabase
            .from("media_items")
            .update({ thumbnail_path: thumbnailPath })
            .eq("id", item.id);
          if (updateError) continue;

          const thumbnailUrl = await getSignedUrl(thumbnailPath);
          set((state) => ({
            items: state.items.map((i) =>
              i.id === item.id ? { ...i, thumbnailUrl: thumbnailUrl ?? i.thumbnailUrl } : i,
            ),
          }));
        } catch {
          // Leave this one showing the placeholder — it'll retry next load.
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    })();
  },

  addFiles: (files, folderId) => {
    const update = (itemId: string, patch: Partial<MediaItem>) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item,
        ),
      }));

    let photos = 0;
    let videos = 0;
    const newItems: MediaItem[] = files.map((file) => {
      const type = detectMediaType(file);
      const position = type === "video" ? ++videos : type === "image" ? ++photos : 0;
      return {
        // Held in memory for the session: the file can be added to the video and played at once, while it uploads.
        ...(type ? { localUrl: URL.createObjectURL(file) } : {}),
        id: id(),
        name: friendlyMediaName(file, type, position),
        type: type ?? "image",
        mimeType: mimeTypeFor(file),
        size: file.size,
        url: "",
        thumbnailUrl: null,
        duration: null,
        folderId,
        createdAt: now(),
        status: "processing",
        stage: "waiting",
        progress: 0,
      };
    });
    newItems.forEach((item, index) => pendingFiles.set(item.id, files[index]));

    set((state) => ({ items: [...newItems, ...state.items] }));

    (async () => {
      const who = await currentUser();
      if (!who.id) {
        newItems.forEach((item) => update(item.id, who.problem!));
        return;
      }
      newItems.forEach((item, index) => void processMediaItem(who.id, item, files[index], update));
    })();

    return newItems.map((item) => item.id);
  },

  retryUpload: (itemId) => {
    const file = pendingFiles.get(itemId);
    const item = get().items.find((i) => i.id === itemId);
    if (!file || !item || item.status !== "error") return;
    const update = (id: string, patch: Partial<MediaItem>) =>
      set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    update(itemId, { status: "processing", stage: "waiting", progress: 0, error: undefined, connectionLost: undefined });
    (async () => {
      const who = await currentUser();
      if (!who.id) {
        update(itemId, who.problem!);
        return;
      }
      const fresh = get().items.find((i) => i.id === itemId);
      if (fresh) void processMediaItem(who.id, fresh, file, update);
    })();
  },

  retryLostUploads: () => {
    for (const item of get().items) {
      if (item.status === "error" && item.connectionLost && pendingFiles.has(item.id)) get().retryUpload(item.id);
    }
  },

  deleteItem: (itemId) => {
    const item = get().items.find((i) => i.id === itemId);
    set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }));
    pendingFiles.delete(itemId);
    if (!item) return;
    if (item.localUrl) URL.revokeObjectURL(item.localUrl);

    (async () => {
      const supabase = createClient();
      const { data: row } = await supabase
        .from("media_items")
        .select("storage_path, thumbnail_path")
        .eq("id", itemId)
        .single();
      if (row) {
        const objectPaths = [row.storage_path, row.thumbnail_path].filter(
          (p): p is string => Boolean(p),
        );
        if (objectPaths.length > 0) {
          await supabase.storage.from(MEDIA_BUCKET).remove(objectPaths);
        }
      }
      await supabase.from("media_items").delete().eq("id", itemId);
    })();
  },

  deleteItems: (itemIds) => {
    const idSet = new Set(itemIds);
    const targets = get().items.filter((i) => idSet.has(i.id));
    for (const target of targets) if (target.localUrl) URL.revokeObjectURL(target.localUrl);
    for (const itemId of itemIds) pendingFiles.delete(itemId);
    set((state) => ({ items: state.items.filter((i) => !idSet.has(i.id)) }));
    if (targets.length === 0) return;

    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from("media_items")
        .select("storage_path, thumbnail_path")
        .in("id", itemIds);
      const objectPaths = (rows ?? []).flatMap((row) =>
        [row.storage_path, row.thumbnail_path].filter((p): p is string => Boolean(p)),
      );
      if (objectPaths.length > 0) {
        await supabase.storage.from(MEDIA_BUCKET).remove(objectPaths);
      }
      await supabase.from("media_items").delete().in("id", itemIds);
    })();
  },

  renameItem: (itemId, name) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, name } : i)),
    }));
    const supabase = createClient();
    void supabase.from("media_items").update({ name }).eq("id", itemId);
  },

  moveItem: (itemId, folderId) => {
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, folderId } : i)),
    }));
    const supabase = createClient();
    void supabase.from("media_items").update({ folder_id: folderId }).eq("id", itemId);
  },

  moveItems: (itemIds, folderId) => {
    const idSet = new Set(itemIds);
    set((state) => ({
      items: state.items.map((i) => (idSet.has(i.id) ? { ...i, folderId } : i)),
    }));
    const supabase = createClient();
    void supabase.from("media_items").update({ folder_id: folderId }).in("id", itemIds);
  },

  createFolder: (name) => {
    const folder: MediaFolder = {
      id: id(),
      name: name.trim() || "Untitled folder",
      createdAt: now(),
    };
    set((state) => ({ folders: [...state.folders, folder] }));

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("media_folders").insert({
        id: folder.id,
        owner_id: user.id,
        name: folder.name,
      });
    })();

    return folder;
  },

  renameFolder: (folderId, name) => {
    set((state) => ({
      folders: state.folders.map((f) => (f.id === folderId ? { ...f, name } : f)),
    }));
    const supabase = createClient();
    void supabase.from("media_folders").update({ name }).eq("id", folderId);
  },

  deleteFolder: (folderId) => {
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== folderId),
      items: state.items.map((i) =>
        i.folderId === folderId ? { ...i, folderId: null } : i,
      ),
    }));
    const supabase = createClient();
    void supabase.from("media_folders").delete().eq("id", folderId);
  },
}));

// An iPhone stops uploads when the screen locks or Safari goes to the
// background, and they fail with a lost connection. Coming back (or the
// signal returning) picks them up again without the user tapping Retry.
if (typeof window !== "undefined") {
  const resume = () => {
    if (document.visibilityState === "visible") useMediaStore.getState().retryLostUploads();
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  window.addEventListener("pageshow", resume);
}
