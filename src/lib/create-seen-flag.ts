// A one-time "seen" flag persisted in localStorage: the shared machinery behind
// the commentary-hint and edge-tap cues, each of which gates a cue that should
// fire once and stay dismissed across sessions. One call per flag, keyed by its
// storage key; bump the key's :v1 suffix to re-trigger everyone with no migration
// code. Private-mode resilience (the in-memory mirror) comes from the shared
// createMirroredStorage; injected storages (tests) bypass it, staying isolated.

import { createMirroredStorage } from "./mirrored-storage";

// The slice of Storage a flag touches; lets tests inject a fake.
type FlagStorage = Pick<Storage, "getItem" | "setItem">;

export interface SeenFlag {
  // Reads tolerantly: any failure means "not seen", so a storage hiccup lets the
  // cue run rather than silently suppressing it.
  hasSeen: (storage?: FlagStorage) => boolean;
  // Records the flag (best-effort to disk, always to the mirror) and notifies
  // same-tab subscribers, so the handoff fires even when persisting fails.
  markSeen: (storage?: FlagStorage) => void;
  // Same-tab subscription to the flag flipping. A localStorage write fires no
  // storage event in the writing tab, so a consumer that outlives the setter
  // (the commentary hint waiting on the tour gate) can't otherwise notice it.
  subscribe: (onChange: () => void) => () => void;
}

export function createSeenFlag(key: string): SeenFlag {
  const store = createMirroredStorage();
  const listeners = new Set<() => void>();

  function hasSeen(storage: FlagStorage = store): boolean {
    try {
      return storage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function markSeen(storage: FlagStorage = store): void {
    try {
      storage.setItem(key, "1");
    } catch {
      // An injected storage may throw; the default's mirror already recorded it.
    }
    for (const listener of listeners) listener();
  }

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }

  return { hasSeen, markSeen, subscribe };
}
