// One-time gate for the edge-tap-to-skip cue, persisted across sessions and kept
// separate from the other hint flags so each surfaces on its own schedule. The
// :v1 suffix lets a redesigned hint re-trigger everyone by bumping the key, with
// no migration code, mirroring the tour and commentary flags.
const SEEN_KEY = "sounds-abroad:edge-tap-hint-seen:v1";

type HintStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): HintStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Touching localStorage can throw outright (sandboxed iframe, hard-blocked
    // cookies), not just on read. Treat that as "no storage".
    return null;
  }
}

// Reads tolerantly: any failure means "not seen", so a storage hiccup lets the
// hint run rather than silently suppressing it.
export function hasSeenEdgeTapHint(storage = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

// Best-effort write: if persisting fails (quota, private mode), the worst case
// is the hint shows again next visit, which is harmless.
export function markEdgeTapHintSeen(storage = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SEEN_KEY, "1");
  } catch {
    return;
  }
}
