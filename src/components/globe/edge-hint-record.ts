// The edge-skip cues' shared memory: unlike the one-shot seen flags, the edge
// affordances repeat until the gesture lands. The contextual hint may open at
// most once per visit, across up to MAX_SHOWS visits; every affordance retires
// permanently the moment the user performs an edge skip. Pure schedule plus its
// persistence, shaped like the tour record.

import {
  createMirroredStorage,
  type MirroredStorage,
} from "@/lib/mirrored-storage";

export interface EdgeHintRecord {
  shows: number;
  used: boolean;
}

export const emptyRecord: EdgeHintRecord = { shows: 0, used: false };

// Enough repeats to survive a missed or forgotten first flash without nagging
// forever.
const MAX_SHOWS = 3;

export function decideShow(record: EdgeHintRecord): boolean {
  return !record.used && record.shows < MAX_SHOWS;
}

// Count this appearance. Persisted at show time, not at dismissal, so the cap
// holds even if the user leaves mid-show.
export function recordShown(record: EdgeHintRecord): EdgeHintRecord {
  return { ...record, shows: record.shows + 1 };
}

// The gesture landed: nothing needs to teach it again, ever.
export function recordUsed(record: EdgeHintRecord): EdgeHintRecord {
  return { ...record, used: true };
}

// A fresh key from the boolean flag's :v1 (no migration code, per the seen-flag
// convention): repeat-until-used is a new contract, so users who saw the old
// one-shot cue get the full schedule once more.
const KEY = "sounds-abroad:edge-tap-hint:v2";

const store = createMirroredStorage();
const listeners = new Set<() => void>();

// Reads tolerantly: any malformed or partial value degrades to the empty record
// (the cue re-teaches) rather than throwing.
function parseRecord(raw: string): EdgeHintRecord {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return emptyRecord;
  const value = parsed as Record<string, unknown>;
  return {
    shows: typeof value.shows === "number" ? value.shows : 0,
    used: value.used === true,
  };
}

export function readRecord(storage: MirroredStorage = store): EdgeHintRecord {
  try {
    const raw = storage.getItem(KEY);
    return raw ? parseRecord(raw) : emptyRecord;
  } catch {
    return emptyRecord;
  }
}

export function writeRecord(
  record: EdgeHintRecord,
  storage: MirroredStorage = store,
): void {
  try {
    storage.setItem(KEY, JSON.stringify(record));
  } catch {
    // An injected storage may throw; the default's mirror already recorded it.
  }
  for (const listener of listeners) listener();
}

// Same-tab subscription so the persistent chevrons retire the instant the
// gesture lands (a localStorage write fires no storage event in its own tab).
export function subscribeRecord(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// Latch used on the first edge skip; later skips leave the record alone.
export function markUsed(storage: MirroredStorage = store): void {
  const record = readRecord(storage);
  if (record.used) return;
  writeRecord(recordUsed(record), storage);
}
