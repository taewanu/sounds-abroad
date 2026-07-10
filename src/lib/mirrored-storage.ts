// localStorage that degrades to an in-memory mirror when access throws (private
// mode, blocked cookies, quota): every write also records to the mirror, and
// reads fall back to it only when localStorage itself throws, so a same-session
// handoff survives even where persistence can't. Each call gets its own mirror,
// so a per-instance flag and a module-singleton store stay isolated. The one
// place this resilience lives, shared by the persisted flags and the tour record.

export type MirroredStorage = Pick<Storage, "getItem" | "setItem">;

export function createMirroredStorage(): MirroredStorage {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      try {
        // Accessible localStorage is authoritative, even when it returns null (a
        // real "not set"), so clearing it isn't shadowed by the mirror.
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
