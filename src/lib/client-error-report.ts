/** Sends a crash from this browser to the server log (see app/api/client-error). */

const sent = new Set<string>();
const MAX_REPORTS = 10;

export function reportClientError(error: unknown, kind: string): void {
  if (typeof window === "undefined") return;
  const err = error instanceof Error ? error : null;
  const message = err ? err.message : String(error);
  const key = `${kind}:${message}`;
  // The same failure in a loop (every frame, say) is reported once.
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);

  const body = JSON.stringify({
    message,
    stack: err?.stack ?? "",
    kind,
    // The path only: query strings can carry tokens.
    page: window.location.pathname,
  });
  try {
    if (navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/client-error", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never cause a second failure.
  }
}

export function resetClientErrorReportsForTests(): void {
  sent.clear();
}
