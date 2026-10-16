import { createAutosaver } from "@/lib/sync/autosaver";
import { TimelineDocumentError, type FrameSize } from "@/lib/sync/timeline-document";
import type { TimelineStorage } from "@/lib/sync/timeline-storage";
import type { TimelineProject } from "@/types/timeline";

export type SyncPhase = "loading" | "ready" | "error" | "conflict";

export interface SyncStatus {
  phase: SyncPhase;
  error: string | null;
}

export interface TimelineSyncOptions {
  projectId: string;
  storage: TimelineStorage;
  /** The last committed project (never a mid-drag preview). */
  getSavable: () => TimelineProject;
  /** Calls the listener after every store change; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  loadProject: (project: TimelineProject, frame: FrameSize) => void;
  onStatus: (status: SyncStatus) => void;
  delayMs?: number;
  maxLoadAttempts?: number;
  retryDelayMs?: number;
}

export interface TimelineSync {
  /** (Re)starts loading. Also how the UI retries after an error or reloads after a conflict. */
  load(): void;
  flush(): Promise<void>;
  /** Abandons loading, stops listening, and saves any pending edit. */
  stop(): Promise<void>;
}

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_MAX_LOAD_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 1500;
const MAX_SAVE_RETRIES = 3;

export function createTimelineSync(options: TimelineSyncOptions): TimelineSync {
  const { projectId, storage, getSavable, subscribe, loadProject, onStatus } = options;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const maxLoadAttempts = options.maxLoadAttempts ?? DEFAULT_MAX_LOAD_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let phase: SyncPhase = "loading";
  let rev = 0;
  let lastSaved: TimelineProject | null = null;
  let unsubscribe: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let loadToken = 0; // bumped to abandon in-flight loads
  let epoch = 0; // bumped by load(): results of saves started earlier are stale
  let stopped = false;
  // The project as it was when stop() ran. A save still queued then must write
  // this, not whatever the shared store holds once another project loads.
  let finalProject: TimelineProject | null = null;
  let saveFailures = 0;
  let saveErrorShown = false;

  // A stopped controller must never report: its editor may already show a
  // different project.
  function setStatus(next: SyncPhase, error: string | null = null) {
    if (stopped) return;
    phase = next;
    onStatus({ phase: next, error });
  }

  // Saving is only ever possible in the "ready" phase, so a failed or
  // unfinished load can never overwrite the stored project.
  async function saveNow() {
    if (phase !== "ready" || lastSaved === null) return;
    const project = finalProject ?? getSavable();
    if (project === lastSaved) return;

    const savedEpoch = epoch;
    let result;
    try {
      result = await storage.save(projectId, project, rev);
    } catch (error) {
      if (savedEpoch !== epoch) return; // a reload already replaced our state
      throw error;
    }
    // A reload while this save was in flight reset rev and lastSaved from a
    // fresh read; applying this outcome would roll them back.
    if (savedEpoch !== epoch) return;

    if (!result.ok) {
      autosaver.cancel();
      setStatus("conflict", "This project was changed somewhere else.");
      return;
    }
    rev = result.rev;
    lastSaved = project;
    saveFailures = 0;
    if (saveErrorShown) {
      saveErrorShown = false;
      setStatus("ready");
    }
  }

  const autosaver = createAutosaver({
    save: saveNow,
    delayMs,
    onError(error) {
      console.error("Failed to autosave timeline:", error);
      if (stopped) return;

      // An unwritable document will not fix itself: report it, don't retry.
      if (error instanceof TimelineDocumentError) {
        saveErrorShown = true;
        setStatus("ready", `Can't save this project: ${error.message}`);
        return;
      }

      saveFailures += 1;
      if (saveFailures <= MAX_SAVE_RETRIES) {
        autosaver.schedule();
        return;
      }
      saveErrorShown = true;
      setStatus("ready", "Couldn't save your changes. Will retry on your next edit.");
    },
  });

  function clearRetryTimer() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function attemptLoad(token: number, attempt: number) {
    storage.load(projectId).then(
      (loaded) => {
        if (token !== loadToken) return;
        rev = loaded.rev;
        loadProject(loaded.project, loaded.frame);
        lastSaved = getSavable();
        saveFailures = 0;

        unsubscribe?.();
        unsubscribe = subscribe(() => {
          if (phase !== "ready") return;
          if (getSavable() === lastSaved) return;
          saveFailures = 0;
          autosaver.schedule();
        });
        setStatus("ready");
      },
      (error: unknown) => {
        if (token !== loadToken) return;
        const permanent = error instanceof TimelineDocumentError;
        if (permanent || attempt >= maxLoadAttempts) {
          setStatus("error", error instanceof Error ? error.message : "Failed to load project");
          return;
        }
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (token === loadToken) attemptLoad(token, attempt + 1);
        }, retryDelayMs);
      },
    );
  }

  return {
    load() {
      stopped = false;
      finalProject = null;
      saveErrorShown = false;
      epoch += 1;
      loadToken += 1;
      clearRetryTimer();
      autosaver.cancel();
      unsubscribe?.();
      unsubscribe = null;
      setStatus("loading");
      attemptLoad(loadToken, 1);
    },

    flush() {
      return autosaver.flush();
    },

    async stop() {
      // Snapshot before anything else can swap the store's contents.
      if (phase === "ready") finalProject = getSavable();
      stopped = true;
      loadToken += 1;
      clearRetryTimer();
      unsubscribe?.();
      unsubscribe = null;
      await autosaver.flush();
    },
  };
}
