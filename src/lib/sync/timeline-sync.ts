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
  let stopped = false;
  let saveFailures = 0;

  function setStatus(next: SyncPhase, error: string | null = null) {
    phase = next;
    onStatus({ phase: next, error });
  }

  // Saving is only ever possible in the "ready" phase, so a failed or
  // unfinished load can never overwrite the stored project.
  async function saveNow() {
    if (phase !== "ready" || lastSaved === null) return;
    const project = getSavable();
    if (project === lastSaved) return;

    const result = await storage.save(projectId, project, rev);
    if (!result.ok) {
      autosaver.cancel();
      setStatus("conflict", "This project was changed somewhere else.");
      return;
    }
    rev = result.rev;
    lastSaved = project;
    saveFailures = 0;
  }

  const autosaver = createAutosaver({
    save: saveNow,
    delayMs,
    onError(error) {
      console.error("Failed to autosave timeline:", error);
      saveFailures += 1;
      if (saveFailures <= MAX_SAVE_RETRIES && !stopped) autosaver.schedule();
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
      stopped = true;
      loadToken += 1;
      clearRetryTimer();
      unsubscribe?.();
      unsubscribe = null;
      await autosaver.flush();
    },
  };
}
