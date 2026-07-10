import {
  createMirroredStorage,
  type MirroredStorage,
} from "@/lib/mirrored-storage";

import { emptyRecord, type TourRecord } from "./tour-record";
import { TEACH_ORDER, type TeachBeat } from "./tour-step";

// Persists the tour record across sessions. A fresh key from the boolean flag's
// `:v1`, so every existing user starts on the empty record and re-sees the
// finished tour once. Private-mode resilience (the in-memory mirror) comes from
// the shared createMirroredStorage, the same one the seen-flags use.
const KEY = "sounds-abroad:tour:v2";

const store = createMirroredStorage();
const listeners = new Set<() => void>();

const TEACHABLE = new Set<string>(TEACH_ORDER);

// Reads tolerantly: any malformed or partial value degrades to the empty record
// (the tour re-teaches) rather than throwing. Unknown `learned` entries are
// dropped so a stale or hand-edited key can't inject beats the machine can't run.
function parseRecord(raw: string): TourRecord {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return emptyRecord;
  const value = parsed as Record<string, unknown>;
  const learned = Array.isArray(value.learned)
    ? (value.learned.filter(
        (beat): beat is TeachBeat =>
          typeof beat === "string" && TEACHABLE.has(beat),
      ) as TeachBeat[])
    : [];
  return {
    learned,
    shows: typeof value.shows === "number" ? value.shows : 0,
    dismissed: value.dismissed === true,
  };
}

export function readRecord(storage: MirroredStorage = store): TourRecord {
  try {
    const raw = storage.getItem(KEY);
    return raw ? parseRecord(raw) : emptyRecord;
  } catch {
    return emptyRecord;
  }
}

export function writeRecord(
  record: TourRecord,
  storage: MirroredStorage = store,
): void {
  try {
    storage.setItem(KEY, JSON.stringify(record));
  } catch {
    // An injected storage may throw; the default's mirror already recorded it.
  }
  for (const listener of listeners) listener();
}

// Same-session subscription, so the commentary hint notices the tour concluding
// mid-session (a localStorage write fires no storage event in the writing tab).
export function subscribeRecord(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
