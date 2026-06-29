"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  hasSeenCommentaryHint,
  markCommentaryHintSeen,
} from "./seen-commentary-hint";

export interface CommentaryHintSeen {
  // null only during SSR, where localStorage is unreadable; the real value on
  // the client's first paint, so a returning user never flashes the pulse.
  seen: boolean | null;
  markSeen: () => void;
}

// The flag changes only via markSeen, paired with the single target row's own
// fire-and-disconnect, so nothing needs to react to a later change: a no-op
// subscribe, the same shape as useSeenTour.
const subscribe = () => () => {};
const serverSnapshot = (): boolean | null => null;

export function useCommentaryHintSeen(): CommentaryHintSeen {
  const seen = useSyncExternalStore<boolean | null>(
    subscribe,
    hasSeenCommentaryHint,
    serverSnapshot,
  );
  const markSeen = useCallback(() => markCommentaryHintSeen(), []);
  return { seen, markSeen };
}
