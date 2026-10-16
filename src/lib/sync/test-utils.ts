import type { FrameSize } from "@/lib/sync/timeline-document";
import type {
  LoadedTimeline,
  SaveResult,
  TimelineStorage,
  VersionSummary,
} from "@/lib/sync/timeline-storage";
import { makeClip, makeProject, makeStandardTracks } from "@/lib/timeline/test-utils";
import type { TimelineProject } from "@/types/timeline";

/** A remote project with a main clip `a` (t1) and an overlay image `o` (t2). */
export function remoteProject(): TimelineProject {
  return makeProject(makeStandardTracks(), [
    makeClip({ id: "a", start: 0, sourceOut: 10 }),
    makeClip({ id: "o", trackId: "t2", kind: "image", sourceDuration: null, start: 2, sourceOut: 3 }),
  ]);
}

/** In-memory TimelineStorage with failure and timing knobs for tests. */
export class MemoryTimelineStorage implements TimelineStorage {
  project: TimelineProject;
  rev: number;
  frame: FrameSize;

  loadCalls = 0;
  saveAttempts = 0;
  saves: Array<{ project: TimelineProject; expectedRev: number }> = [];
  maxInFlightSaves = 0;

  /** Fail this many loads with a network error, then succeed. */
  loadFailures = 0;
  /** Fail every load with this error. */
  loadError: Error | null = null;
  /** Loads wait for this promise. */
  loadGate: Promise<void> | null = null;
  /** Fail this many saves with a network error (Infinity = always). */
  saveFailures = 0;
  /** Saves wait for this promise. */
  saveGate: Promise<void> | null = null;

  private inFlightSaves = 0;
  versions = new Map<
    string,
    { label: string | null; createdAt: string; project: TimelineProject; frame: FrameSize }
  >();

  constructor(
    project: TimelineProject = remoteProject(),
    rev = 0,
    frame: FrameSize = { width: 1920, height: 1080 },
  ) {
    this.project = project;
    this.rev = rev;
    this.frame = frame;
  }

  async load(): Promise<LoadedTimeline> {
    this.loadCalls += 1;
    if (this.loadGate) await this.loadGate;
    if (this.loadError) throw this.loadError;
    if (this.loadFailures > 0) {
      this.loadFailures -= 1;
      throw new Error("network down");
    }
    return { project: this.project, rev: this.rev, frame: this.frame };
  }

  async save(
    _projectId: string,
    project: TimelineProject,
    expectedRev: number,
  ): Promise<SaveResult> {
    this.saveAttempts += 1;
    this.inFlightSaves += 1;
    this.maxInFlightSaves = Math.max(this.maxInFlightSaves, this.inFlightSaves);
    try {
      if (this.saveGate) await this.saveGate;
      if (this.saveFailures > 0) {
        this.saveFailures -= 1;
        throw new Error("offline");
      }
      if (expectedRev !== this.rev) return { ok: false, reason: "conflict" };
      this.rev += 1;
      this.project = project;
      this.saves.push({ project, expectedRev });
      return { ok: true, rev: this.rev };
    } finally {
      this.inFlightSaves -= 1;
    }
  }

  async saveVersion(
    _projectId: string,
    project: TimelineProject,
    frame: FrameSize,
    label?: string,
  ): Promise<void> {
    this.versions.set(`v${this.versions.size + 1}`, {
      label: label?.trim() || null,
      createdAt: new Date(0).toISOString(),
      project,
      frame,
    });
  }

  async listVersions(): Promise<VersionSummary[]> {
    return Array.from(this.versions, ([id, v]) => ({
      id,
      label: v.label,
      createdAt: v.createdAt,
    }));
  }

  async loadVersion(_projectId: string, versionId: string) {
    const version = this.versions.get(versionId);
    if (!version) throw new Error("Version not found");
    return { project: version.project, frame: version.frame };
  }

  async deleteVersion(versionId: string): Promise<void> {
    this.versions.delete(versionId);
  }
}
