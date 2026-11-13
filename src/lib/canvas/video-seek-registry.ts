/**
 * Video seeks are asynchronous. When something needs every video on the
 * canvas to be showing the right frame before it continues (video export
 * capturing frame by frame), it awaits `waitForPendingSeeks()`; renderers
 * register each seek they start with `trackSeek`.
 */
const pending = new Set<Promise<void>>();

export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 1 / 120) return Promise.resolve();
  const promise = new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", done);
      clearTimeout(timer);
      resolve();
    };
    // Never hold an export hostage to a video that refuses to seek.
    const timer = setTimeout(done, 3000);
    video.addEventListener("seeked", done);
    video.addEventListener("error", done);
    video.currentTime = time;
  });
  pending.add(promise);
  void promise.finally(() => pending.delete(promise));
  return promise;
}

export async function waitForPendingSeeks(): Promise<void> {
  while (pending.size > 0) {
    await Promise.all(Array.from(pending));
  }
}

export function hasPendingSeeks(): boolean {
  return pending.size > 0;
}
