import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  loadProjectContent,
  saveProjectContent,
  saveProjectFrame,
} from "@/lib/sync/project-content-sync";
import type { Project, ProjectFolder, ProjectId } from "@/types/project";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectFolderRow = Database["public"]["Tables"]["project_folders"]["Row"];

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favorite: row.favorite,
    deletedAt: row.deleted_at,
    folderId: row.folder_id,
  };
}

function rowToFolder(row: ProjectFolderRow): ProjectFolder {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

interface ProjectStore {
  projects: Project[];
  folders: ProjectFolder[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (name: string, folderId?: string | null) => Promise<Project>;
  renameProject: (id: ProjectId, name: string) => Promise<void>;
  deleteProject: (id: ProjectId) => Promise<void>;
  restoreProject: (id: ProjectId) => Promise<void>;
  permanentlyDeleteProject: (id: ProjectId) => Promise<void>;
  emptyTrash: () => Promise<void>;
  duplicateProject: (id: ProjectId) => Promise<void>;
  toggleFavorite: (id: ProjectId) => Promise<void>;
  moveProject: (id: ProjectId, folderId: string | null) => Promise<void>;
  createFolder: (name: string) => Promise<ProjectFolder | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  folders: [],
  loaded: false,
  loading: false,
  error: null,

  fetchProjects: async () => {
    if (get().loading || (get().loaded && !get().error)) return;
    set({ loading: true, error: null });

    const supabase = createClient();
    const [projectsRes, foldersRes] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("project_folders").select("*").order("created_at", { ascending: true }),
    ]);

    if (projectsRes.error) {
      set({ loading: false, loaded: true, error: projectsRes.error.message });
      return;
    }
    if (foldersRes.error) {
      set({ loading: false, loaded: true, error: foldersRes.error.message });
      return;
    }

    set({
      projects: (projectsRes.data ?? []).map(rowToProject),
      folders: (foldersRes.data ?? []).map(rowToFolder),
      loading: false,
      loaded: true,
    });
  },

  createProject: async (name, folderId = null) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in to create a project.");

    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: name.trim() || "Untitled Scrapbook",
        folder_id: folderId,
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create project.");

    const project = rowToProject(data);
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  renameProject: async (id, name) => {
    const updatedAt = new Date().toISOString();
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, name, updatedAt } : p)),
    }));
    const supabase = createClient();
    await supabase.from("projects").update({ name }).eq("id", id);
  },

  deleteProject: async (id) => {
    const deletedAt = new Date().toISOString();
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, deletedAt } : p)),
    }));
    const supabase = createClient();
    await supabase.from("projects").update({ deleted_at: deletedAt }).eq("id", id);
  },

  restoreProject: async (id) => {
    const updatedAt = new Date().toISOString();
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, deletedAt: null, updatedAt } : p,
      ),
    }));
    const supabase = createClient();
    await supabase.from("projects").update({ deleted_at: null }).eq("id", id);
  },

  permanentlyDeleteProject: async (id) => {
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
    const supabase = createClient();
    await supabase.from("projects").delete().eq("id", id);
  },

  emptyTrash: async () => {
    const idsToDelete = get()
      .projects.filter((p) => p.deletedAt)
      .map((p) => p.id);
    if (idsToDelete.length === 0) return;

    set((state) => ({ projects: state.projects.filter((p) => !p.deletedAt) }));
    const supabase = createClient();
    await supabase.from("projects").delete().in("id", idsToDelete);
  },

  duplicateProject: async (id) => {
    const source = get().projects.find((p) => p.id === id);
    if (!source) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: `${source.name} (Copy)`,
        thumbnail_url: source.thumbnailUrl,
        folder_id: source.folderId,
      })
      .select()
      .single();

    if (error || !data) return;
    const project = rowToProject(data);
    set((state) => ({ projects: [project, ...state.projects] }));

    const content = await loadProjectContent(source.id);
    const trackIdMap = new Map(content.tracks.map((t) => [t.id, crypto.randomUUID()]));
    const objects = content.objects.map((o) => ({ ...o, id: crypto.randomUUID() }));
    const tracks = content.tracks.map((t) => ({ ...t, id: trackIdMap.get(t.id)! }));
    const clips = content.clips.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
      trackId: trackIdMap.get(c.trackId)!,
    }));

    await saveProjectContent(project.id, objects, tracks, clips);
    if (content.frame) await saveProjectFrame(project.id, content.frame);
  },

  toggleFavorite: async (id) => {
    const current = get().projects.find((p) => p.id === id);
    if (!current) return;
    const favorite = !current.favorite;

    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, favorite } : p)),
    }));
    const supabase = createClient();
    await supabase.from("projects").update({ favorite }).eq("id", id);
  },

  moveProject: async (id, folderId) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, folderId } : p)),
    }));
    const supabase = createClient();
    await supabase.from("projects").update({ folder_id: folderId }).eq("id", id);
  },

  createFolder: async (name) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const trimmed = name.trim() || "Untitled folder";
    const { data, error } = await supabase
      .from("project_folders")
      .insert({ owner_id: user.id, name: trimmed })
      .select()
      .single();

    if (error || !data) return null;
    const folder = rowToFolder(data);
    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  renameFolder: async (folderId, name) => {
    set((state) => ({
      folders: state.folders.map((f) => (f.id === folderId ? { ...f, name } : f)),
    }));
    const supabase = createClient();
    await supabase.from("project_folders").update({ name }).eq("id", folderId);
  },

  deleteFolder: async (folderId) => {
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== folderId),
      projects: state.projects.map((p) =>
        p.folderId === folderId ? { ...p, folderId: null } : p,
      ),
    }));
    const supabase = createClient();
    await supabase.from("project_folders").delete().eq("id", folderId);
  },
}));
