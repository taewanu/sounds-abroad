// The edge chevrons' memory: they repeat on every visit until the user performs
// a step, then retire permanently. A latch plus its persistence.

import { createMirroredStorage, type MirroredStorage } from '@/lib/mirrored-storage';

export interface EdgeHintRecord {
  used: boolean;
}

export const emptyRecord: EdgeHintRecord = { used: false };

// A fresh key (no migration code, per the seen-flag convention): :v2 latched on
// the retired edge skip, which says nothing about whether the step is learned.
const KEY = 'sounds-abroad:edge-tap-hint:v3';

const store = createMirroredStorage();
const listeners = new Set<() => void>();

// Reads tolerantly: any malformed value degrades to the empty record (the cue
// re-teaches) rather than throwing.
function parseRecord(raw: string): EdgeHintRecord {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return emptyRecord;
  return { used: (parsed as Record<string, unknown>).used === true };
}

export function readRecord(storage: MirroredStorage = store): EdgeHintRecord {
  try {
    const raw = storage.getItem(KEY);
    return raw ? parseRecord(raw) : emptyRecord;
  } catch {
    return emptyRecord;
  }
}

export function writeRecord(record: EdgeHintRecord, storage: MirroredStorage = store): void {
  try {
    storage.setItem(KEY, JSON.stringify(record));
  } catch {
    // An injected storage may throw; the default's mirror already recorded it.
  }
  for (const listener of listeners) listener();
}

// Same-tab subscription so the chevrons retire the instant the gesture lands (a
// localStorage write fires no storage event in its own tab).
export function subscribeRecord(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// Latch used on the first step; later steps leave the record alone.
export function markUsed(storage: MirroredStorage = store): void {
  if (readRecord(storage).used) return;
  writeRecord({ used: true }, storage);
}
