"use client";

import * as React from "react";

const KEY = "scrapbook-brand-colors";
const MAX = 12;
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function write(colors: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(colors));
  } catch {
    // Private mode etc. — the palette just won't be remembered.
  }
  listeners.forEach((l) => l());
}

/**
 * Your saved brand colours, shown wherever you pick a colour. Remembered in
 * this browser.
 */
export function useBrandColors() {
  const [colors, setColors] = React.useState<string[]>([]);
  React.useEffect(() => {
    const sync = () => setColors(read());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const add = React.useCallback((color: string) => {
    const current = read();
    const c = color.toLowerCase();
    if (current.includes(c)) return;
    write([...current, c].slice(-MAX));
  }, []);

  const remove = React.useCallback((color: string) => {
    write(read().filter((c) => c !== color));
  }, []);

  return { colors, add, remove };
}
