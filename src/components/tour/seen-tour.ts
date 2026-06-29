// First-run gate for the onboarding tour, persisted across sessions (unlike the
// per-session visited set). The :v1 suffix lets a redesigned tour re-trigger
// everyone by bumping the key, with no migration code.
const SEEN_KEY = "sounds-abroad:tour-seen:v1";

type TourStorage = Pick<Storage, "getItem" | "setItem">;

// In-memory mirror for the default storage, so the same-tab handoff survives a
// localStorage that's unavailable or throwing (private mode, blocked cookies,
// quota): the write still records here and reads fall back to it even when it
// can't persist. Injected storages (tests) never touch this, staying isolated.
const memory = new Map<string, string>();

function defaultStorage(): TourStorage {
  return {
    getItem(key) {
      try {
        // Accessible localStorage is authoritative, even when it returns null
        // (a real "not set"), so clearing it isn't shadowed by the mirror.
        if (typeof localStorage !== "undefined")
          return localStorage.getItem(key);
      } catch {
        // Touching localStorage can throw outright (sandboxed iframe,
        // hard-blocked cookies); only then fall back to the in-memory mirror.
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        if (typeof localStorage !== "undefined")
          localStorage.setItem(key, value);
      } catch {
        // Best-effort persistence; the in-memory mirror already holds it.
      }
    },
  };
}

// Reads tolerantly: any failure means "not seen", so a storage hiccup makes the
// tour run rather than silently suppressing it.
export function hasSeenTour(storage = defaultStorage()): boolean {
  try {
    return storage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

// Same-tab subscribers to the flag flipping. A localStorage write fires no
// storage event in the writing tab, so a consumer that outlives the tour (the
// commentary hint) can't otherwise notice the gate opening.
const seenListeners = new Set<() => void>();

export function subscribeSeenTour(onChange: () => void): () => void {
  seenListeners.add(onChange);
  return () => seenListeners.delete(onChange);
}

// Records the flag (best-effort to disk, always to the in-memory mirror) and
// notifies same-tab subscribers, so the handoff fires even when persisting fails.
export function markTourSeen(storage = defaultStorage()): void {
  try {
    storage.setItem(SEEN_KEY, "1");
  } catch {
    // An injected storage may throw; the default's mirror already recorded it.
  }
  for (const listener of seenListeners) listener();
}
