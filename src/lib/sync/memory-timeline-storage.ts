import { emptyTimeline, type FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage, VersionSummary } from "@/lib/sync/timeline-storage";
import { createId } from "@/lib/timeline/ids";
import type { TimelineProject } from "@/types/timeline";

const DEFAULT_FRAME: FrameSize = { width: 1920, height: 1080 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface StoredVersion extends VersionSummary {
  project: TimelineProject;
  frame: FrameSize;
}

/** A TimelineStorage that lives in memory: for the developer harness and tests. */
export function createMemoryTimelineStorage(options: { frame?: FrameSize } = {}): TimelineStorage {
  const frame = options.frame ?? DEFAULT_FRAME;
  const stored = new Map<string, { project: TimelineProject; rev: number }>();
  const versions: StoredVersion[] = [];
  let tick = 0;

  return {
    async load(projectId) {
      const entry = stored.get(projectId);
      return {
        project: entry ? clone(entry.project) : emptyTimeline(projectId),
        rev: entry?.rev ?? 0,
        frame,
      };
    },

    async save(projectId, project, expectedRev) {
      const current = stored.get(projectId)?.rev ?? 0;
      if (current !== expectedRev) return { ok: false, reason: "conflict" };
      stored.set(projectId, { project: clone(project), rev: current + 1 });
      return { ok: true, rev: current + 1 };
    },

    async saveVersion(projectId, project, versionFrame, label) {
      tick += 1;
      versions.push({
        id: createId(),
        label: label?.trim() || null,
        createdAt: `2026-01-01T00:00:${String(tick % 60).padStart(2, "0")}.000Z`,
        project: clone({ ...project, id: projectId }),
        frame: versionFrame,
      });
    },

    async listVersions() {
      return versions
        .map<VersionSummary>(({ id, label, createdAt }) => ({ id, label, createdAt }))
        .reverse();
    },

    async loadVersion(projectId, versionId) {
      const version = versions.find((v) => v.id === versionId);
      if (!version) throw new Error("Version not found");
      return { project: clone({ ...version.project, id: projectId }), frame: version.frame };
    },

    async deleteVersion(versionId) {
      const index = versions.findIndex((v) => v.id === versionId);
      if (index >= 0) versions.splice(index, 1);
    },
  };
}
