export type ProjectId = string;

export interface Project {
  id: ProjectId;
  name: string;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  deletedAt: string | null;
  folderId: string | null;
}

export interface ProjectFolder {
  id: string;
  name: string;
  createdAt: string;
}

export const TRASH_RETENTION_DAYS = 30;
