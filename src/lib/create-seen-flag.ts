// A one-time "seen" flag persisted in localStorage: the shared machinery behind
// the tour, commentary-hint, and edge-tap cues, each of which gates a cue that
// should fire once and stay dismissed across sessions. One call per flag, keyed
// by its storage key; bump the key's :v1 suffix to re-trigger everyone with no
// migration code.
//
// Each flag closes over an in-memory mirror so a same-tab handoff survives a
// localStorage that's unavailable or throwing (private mode, blocked cookies,
// quota): the write records to the mirror even when it can't persist, and reads
// fall back to it. Injected storages (tests) never touch the mirror, staying
// isolated. This mirror lived only in the tour flag before; folding it into the
// factory gives all three flags the same private-mode resilience.

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
  const memory = new Map<string, string>();
  const listeners = new Set<() => void>();

  function defaultStorage(): FlagStorage {
    return {
      getItem(k) {
        try {
          // Accessible localStorage is authoritative, even when it returns null
          // (a real "not set"), so clearing it isn't shadowed by the mirror.
          if (typeof localStorage !== "undefined")
            return localStorage.getItem(k);
        } catch {
          // Touching localStorage can throw outright (sandboxed iframe,
          // hard-blocked cookies); only then fall back to the in-memory mirror.
        }
        return memory.get(k) ?? null;
      },
      setItem(k, value) {
        memory.set(k, value);
        try {
          if (typeof localStorage !== "undefined")
            localStorage.setItem(k, value);
        } catch {
          // Best-effort persistence; the in-memory mirror already holds it.
        }
      },
    };
  }

  function hasSeen(storage: FlagStorage = defaultStorage()): boolean {
    try {
      return storage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function markSeen(storage: FlagStorage = defaultStorage()): void {
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
