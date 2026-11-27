import { describe, expect, test, vi } from 'vitest';

import {
  emptyRecord,
  markUsed,
  readRecord,
  subscribeRecord,
  writeRecord,
  type EdgeHintRecord,
} from './edge-hint-record';

const KEY = 'sounds-abroad:edge-tap-hint:v3';
const RETIRED_SKIP_KEY = 'sounds-abroad:edge-tap-hint:v2';

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => void map.set(k, v)),
  };
}

describe('readRecord', () => {
  test('is the empty record when nothing is stored', () => {
    expect(readRecord(fakeStorage())).toEqual(emptyRecord);
  });

  test('ignores a latch stored for the retired edge skip', () => {
    const stored = JSON.stringify({ shows: 3, used: true });

    expect(readRecord(fakeStorage({ [RETIRED_SKIP_KEY]: stored }))).toEqual(emptyRecord);
  });

  test('round-trips a written record', () => {
    const record: EdgeHintRecord = { used: true };
    const storage = fakeStorage();

    writeRecord(record, storage);

    expect(readRecord(storage)).toEqual(record);
  });

  test('falls back to the empty record on corrupt JSON rather than throwing', () => {
    expect(readRecord(fakeStorage({ [KEY]: '{not json' }))).toEqual(emptyRecord);
  });

  test('reads a wrong-typed latch as unused', () => {
    expect(readRecord(fakeStorage({ [KEY]: JSON.stringify({ used: 'yes' }) }))).toEqual(
      emptyRecord,
    );
  });

  test('returns the empty record instead of throwing when reading throws', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: vi.fn(),
    };

    expect(readRecord(hostile)).toEqual(emptyRecord);
  });
});

describe('writeRecord', () => {
  test('swallows a failing write rather than throwing', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(() => writeRecord(emptyRecord, hostile)).not.toThrow();
  });

  test('notifies a subscriber when the record is written', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeRecord(onChange);

    writeRecord(emptyRecord, fakeStorage());

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('stops notifying after unsubscribe', () => {
    const onChange = vi.fn();

    subscribeRecord(onChange)();
    writeRecord(emptyRecord, fakeStorage());

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('markUsed', () => {
  test('latches used', () => {
    const storage = fakeStorage();

    markUsed(storage);

    expect(readRecord(storage)).toEqual({ used: true });
  });

  test('a repeat use writes nothing further', () => {
    const storage = fakeStorage();
    markUsed(storage);
    const writesAfterFirst = storage.setItem.mock.calls.length;

    markUsed(storage);

    expect(storage.setItem.mock.calls.length).toBe(writesAfterFirst);
  });
});
