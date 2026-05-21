const STORAGE_KEY = "sa:visited";

function getStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  return globalThis.localStorage;
}

export function readVisited(): Set<string> {
  const storage = getStorage();
  if (!storage) return new Set();

  const stored = storage.getItem(STORAGE_KEY);
  if (stored === null) return new Set();

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function markVisited(code: string): void {
  const storage = getStorage();
  if (!storage) return;

  const visited = readVisited();
  visited.add(code);
  storage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
}

export function resetVisited(): void {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(STORAGE_KEY);
}
