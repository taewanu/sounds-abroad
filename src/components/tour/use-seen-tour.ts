"use client";

import { useCallback, useSyncExternalStore } from "react";

import { hasSeenTour, markTourSeen } from "./seen-tour";

export interface SeenTour {
  // null only during SSR, where localStorage is unreadable; the real value on
  // the client's first paint, so returning users never flash the coach marks.
  seen: boolean | null;
  markSeen: () => void;
}

// The flag changes only via markSeen, which the host pairs with its own
// unmount, so nothing needs to react to a later change: a no-op subscribe.
const subscribe = () => () => {};
const serverSnapshot = (): boolean | null => null;

// React access to the seen-flag. useSyncExternalStore reads localStorage on the
// client without a setState-in-effect and reconciles the SSR/client split for
// us, the same shape as usePrefersReducedMotion.
export function useSeenTour(): SeenTour {
  const seen = useSyncExternalStore<boolean | null>(
    subscribe,
    hasSeenTour,
    serverSnapshot,
  );
  const markSeen = useCallback(() => markTourSeen(), []);
  return { seen, markSeen };
}
