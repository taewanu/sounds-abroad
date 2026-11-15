"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Reads the setting at call time, so code that writes motion imperatively can
// honor it without putting a hook value in its callback dependencies.
export function prefersReducedMotion(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Tracks the OS "reduce motion" setting as a live boolean. Server has no
// matchMedia, so the SSR snapshot assumes motion is allowed; the store corrects
// it on hydration if the user prefers reduced motion.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
