import type { FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineProject } from "@/types/timeline";

export interface LoadedTimeline {
  project: TimelineProject;
  /** Revision this project was loaded at; pass it back to `save`. */
  rev: number;
  frame: FrameSize;
}

export type SaveResult = { ok: true; rev: number } | { ok: false; reason: "conflict" };

export interface VersionSummary {
  id: string;
  label: string | null;
  createdAt: string;
}

export interface TimelineStorage {
  /** Throws TimelineDocumentError for a malformed stored document. */
  load(projectId: string): Promise<LoadedTimeline>;
  /**
   * Replaces the stored timeline only if its revision still equals
   * `expectedRev`. Returns `conflict` instead of overwriting; throws on
   * database errors.
   */
  save(projectId: string, project: TimelineProject, expectedRev: number): Promise<SaveResult>;
  saveVersion(
    projectId: string,
    project: TimelineProject,
    frame: FrameSize,
    label?: string,
  ): Promise<void>;
  listVersions(projectId: string): Promise<VersionSummary[]>;
  loadVersion(
    projectId: string,
    versionId: string,
  ): Promise<{ project: TimelineProject; frame: FrameSize }>;
  deleteVersion(versionId: string): Promise<void>;
}
