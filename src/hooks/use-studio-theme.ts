"use client";

import * as React from "react";

/**
 * The editor is dark, like CapCut: while it is open the page gets the dark
 * colours and the editor's own palette. It is on the page itself (not just the
 * editor's box) so dialogs and sheets, which open outside it, match. A dark
 * mode the user had chosen is left as it was when the editor closes.
 */
export function useStudioTheme(): void {
  React.useEffect(() => {
    const root = document.documentElement;
    const alreadyDark = root.classList.contains("dark");
    root.classList.add("dark", "studio-theme");
    return () => {
      root.classList.remove("studio-theme");
      if (!alreadyDark) root.classList.remove("dark");
    };
  }, []);
}
