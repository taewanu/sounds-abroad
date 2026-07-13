"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

// Whether the primary input is a coarse pointer (touch), as a live boolean.
// Server has no matchMedia, so the SSR snapshot assumes a fine pointer:
// touch-only affordances stay hidden until hydration confirms a touch device,
// so they can only appear, never flash and vanish on desktop.
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
