// First-run gate for the onboarding tour, persisted across sessions (unlike the
// per-session visited set). The :v1 suffix lets a redesigned tour re-trigger
// everyone by bumping the key, with no migration code.
const SEEN_KEY = "sounds-abroad:tour-seen:v1";

type TourStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): TourStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Touching localStorage can throw outright (sandboxed iframe, hard-blocked
    // cookies), not just on read. Treat that as "no storage".
    return null;
  }
}

// Reads tolerantly: any failure means "not seen", so a storage hiccup makes the
// tour run rather than silently suppressing it.
export function hasSeenTour(storage = defaultStorage()): boolean {
  if (!storage) return false;
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

// Best-effort write: if persisting fails (quota, private mode), the worst case
// is the tour shows again next visit, which is harmless.
export function markTourSeen(storage = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SEEN_KEY, "1");
  } catch {
    return;
  }
  for (const listener of seenListeners) listener();
}
