"use client";

import * as React from "react";

/**
 * While `active` (a file the video uses is still uploading), closing or leaving
 * the page asks first: the upload would be lost, and the video would be left
 * pointing at a file that was never saved.
 */
export function useUploadGuard(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a value to show the question at all.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
