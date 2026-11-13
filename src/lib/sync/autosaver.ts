export interface AutosaverOptions {
  save: () => Promise<void>;
  delayMs: number;
  onError?: (error: unknown) => void;
}

export interface Autosaver {
  /** Debounced: (re)starts the timer. */
  schedule(): void;
  /** Runs a pending save now and resolves once nothing is running or queued. */
  flush(): Promise<void>;
  /** Drops a pending save. A save already in flight still completes. */
  cancel(): void;
}

export function createAutosaver({ save, delayMs, onError }: AutosaverOptions): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let rerun = false;

  function run(): Promise<void> {
    if (inFlight) {
      rerun = true;
      return inFlight;
    }
    // `save` runs in a microtask so `inFlight` is assigned before it can
    // finish, even if it throws synchronously.
    const current: Promise<void> = Promise.resolve()
      .then(save)
      .catch((error: unknown) => onError?.(error))
      .then(() => {
        inFlight = null;
        if (rerun) {
          rerun = false;
          return run();
        }
      });
    inFlight = current;
    return current;
  }

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        await run();
      } else if (inFlight) {
        await inFlight;
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      rerun = false;
    },
  };
}
