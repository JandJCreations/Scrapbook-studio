"use client";

import * as React from "react";

import { reportClientError } from "@/lib/client-error-report";

/** Reports uncaught errors and rejected promises from anywhere on the page. */
export function ClientErrorReporter() {
  React.useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message, "error");
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
