"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { SeenFlag } from "./create-seen-flag";

export interface SeenFlagState {
  // null only during SSR, where localStorage is unreadable; the real value on
  // the client's first paint, so a returning user never flashes the cue.
  seen: boolean | null;
  markSeen: () => void;
}

// The flag flips only via markSeen, which every caller pairs with its own
// fire-and-dismiss, so nothing needs to react to a later change: a no-op
// subscribe. A consumer that must react to another flag opening (the commentary
// hint watching the tour) subscribes to that flag directly, not through here.
const noopSubscribe = () => () => {};
const serverSnapshot = (): boolean | null => null;

// SSR-safe React read of a seen-flag. useSyncExternalStore reads localStorage on
// the client without a setState-in-effect and reconciles the SSR/client split,
// the same shape as usePrefersReducedMotion.
export function useSeenFlag(flag: SeenFlag): SeenFlagState {
  const seen = useSyncExternalStore<boolean | null>(
    noopSubscribe,
    flag.hasSeen,
    serverSnapshot,
  );
  const markSeen = useCallback(() => flag.markSeen(), [flag]);
  return { seen, markSeen };
}
