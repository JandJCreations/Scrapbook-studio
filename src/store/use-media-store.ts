import { create } from "zustand";

import {
  generateVideoThumbnail,
  getAudioDuration,
} from "@/lib/media/generate-thumbnail";
import { detectMediaType } from "@/lib/media/file-type";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { dataUrlToBlob, getSignedUrl, getSignedUrls, MEDIA_BUCKET } from "@/lib/supabase/storage";
import type { MediaFolder, MediaItem } from "@/types/media";

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
  addFiles: (files: File[], folderId: string | null) => void;
  deleteItem: (id: string) => void;
  renameItem: (id: string, name: string) => void;
  moveItem: (id: string, folderId: string | null) => void;
  createFolder: (name: string) => MediaFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
}

async function processMediaItem(
  userId: string,
  item: MediaItem,
  file: File,
  update: (id: string, patch: Partial<MediaItem>) => void,
) {
  const type = detectMediaType(file);

  if (!type) {
    update(item.id, { status: "error", error: "Unsupported file type", progress: 0 });
    return;
  }

  const supabase = createClient();
  const localUrl = URL.createObjectURL(file);

  try {
    let duration: number | null = null;
    let thumbnailBlob: Blob | null = null;

    if (type === "video") {
      const result = await generateVideoThumbnail(localUrl);
      duration = result.duration;
      thumbnailBlob = dataUrlToBlob(result.thumbnailUrl);
    } else if (type === "audio") {
      duration = await getAudioDuration(localUrl).catch(() => 0);
    }

    update(item.id, { progress: 30 });

    const storagePath = storagePathFor(userId, item.id, file.name);
    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;
    update(item.id, { progress: 70 });

    let thumbnailPath: string | null = null;
    if (thumbnailBlob) {
      thumbnailPath = thumbnailPathFor(userId, item.id);
      const { error: thumbError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(thumbnailPath, thumbnailBlob, { contentType: "image/jpeg", upsert: true });
      if (thumbError) throw thumbError;
    }

    const url = await getSignedUrl(storagePath);
    const thumbnailUrl =
      type === "image" ? url : thumbnailPath ? await getSignedUrl(thumbnailPath) : null;

    const { error: insertError } = await supabase.from("media_items").insert({
      id: item.id,
      owner_id: userId,
      folder_id: item.folderId,
      name: item.name,
      type,
      mime_type: item.mimeType,
      size: item.size,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      duration,
      status: "ready",
    });
    if (insertError) throw insertError;

    update(item.id, { progress: 100, status: "ready", url: url ?? "", thumbnailUrl, duration });
  } catch (err) {
    update(item.id, {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to process file",
    });
  } finally {
    URL.revokeObjectURL(localUrl);
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
      thumbnailUrl: row.thumbnail_path
        ? (signedUrls.get(row.thumbnail_path) ?? null)
        : row.type === "image"
          ? (signedUrls.get(row.storage_path) ?? null)
          : null,
      duration: row.duration,
      folderId: row.folder_id,
      createdAt: row.created_at,
      status: row.status,
      progress: 100,
    }));

    set({
      items,
      folders: (foldersRes.data ?? []).map(rowToFolder),
      loading: false,
      loaded: true,
    });
  },

  addFiles: (files, folderId) => {
    const update = (itemId: string, patch: Partial<MediaItem>) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item,
        ),
      }));

    const newItems: MediaItem[] = files.map((file) => {
      const type = detectMediaType(file);
      return {
        id: id(),
        name: file.name,
        type: type ?? "image",
        mimeType: file.type,
        size: file.size,
        url: "",
        thumbnailUrl: null,
        duration: null,
        folderId,
        createdAt: now(),
        status: "processing",
        progress: 0,
      };
    });

    set((state) => ({ items: [...newItems, ...state.items] }));

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        newItems.forEach((item) =>
          update(item.id, { status: "error", error: "Not signed in" }),
        );
        return;
      }
      newItems.forEach((item, index) => {
        void processMediaItem(user.id, item, files[index], update);
      });
    })();
  },

  deleteItem: (itemId) => {
    const item = get().items.find((i) => i.id === itemId);
    set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }));
    if (!item) return;

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
