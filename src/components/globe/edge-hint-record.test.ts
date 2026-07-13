import { describe, expect, test, vi } from "vitest";

import {
  decideShow,
  emptyRecord,
  markUsed,
  readRecord,
  recordShown,
  recordUsed,
  subscribeRecord,
  writeRecord,
  type EdgeHintRecord,
} from "./edge-hint-record";

const KEY = "sounds-abroad:edge-tap-hint:v2";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => void map.set(k, v)),
  };
}

describe("decideShow", () => {
  test("a fresh record shows the cue", () => {
    expect(decideShow(emptyRecord)).toBe(true);
  });

  test("keeps showing while under the cap and the gesture is unused", () => {
    expect(decideShow({ shows: 2, used: false })).toBe(true);
  });

  test("stops at the show cap even when the gesture was never used", () => {
    expect(decideShow({ shows: 3, used: false })).toBe(false);
  });

  test("stops permanently once used, regardless of remaining shows", () => {
    expect(decideShow({ shows: 0, used: true })).toBe(false);
  });
});

describe("recordShown", () => {
  test("counts an appearance without touching used", () => {
    expect(recordShown(emptyRecord)).toEqual({ shows: 1, used: false });
  });

  test("increments from a prior count", () => {
    expect(recordShown({ shows: 2, used: false }).shows).toBe(3);
  });
});

describe("recordUsed", () => {
  test("latches used without touching the show count", () => {
    expect(recordUsed({ shows: 2, used: false })).toEqual({
      shows: 2,
      used: true,
    });
  });
});

describe("readRecord", () => {
  test("is the empty record when nothing is stored (a fresh v2 key)", () => {
    expect(readRecord(fakeStorage())).toEqual(emptyRecord);
  });

  test("round-trips a written record", () => {
    const record: EdgeHintRecord = { shows: 2, used: true };
    const storage = fakeStorage();

    writeRecord(record, storage);

    expect(readRecord(storage)).toEqual(record);
  });

  test("falls back to the empty record on corrupt JSON rather than throwing", () => {
    expect(readRecord(fakeStorage({ [KEY]: "{not json" }))).toEqual(
      emptyRecord,
    );
  });

  test("degrades wrong-typed fields individually rather than dropping the record", () => {
    const stored = JSON.stringify({ shows: "9", used: true });

    expect(readRecord(fakeStorage({ [KEY]: stored }))).toEqual({
      shows: 0,
      used: true,
    });
  });

  test("returns the empty record instead of throwing when reading throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: vi.fn(),
    };

    expect(readRecord(hostile)).toEqual(emptyRecord);
  });
});

describe("writeRecord", () => {
  test("swallows a failing write rather than throwing", () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(() => writeRecord(emptyRecord, hostile)).not.toThrow();
  });

  test("notifies a subscriber when the record is written", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeRecord(onChange);

    writeRecord(emptyRecord, fakeStorage());

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test("stops notifying after unsubscribe", () => {
    const onChange = vi.fn();

    subscribeRecord(onChange)();
    writeRecord(emptyRecord, fakeStorage());

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("markUsed", () => {
  test("latches used on top of the stored show count", () => {
    const storage = fakeStorage();
    writeRecord({ shows: 2, used: false }, storage);

    markUsed(storage);

    expect(readRecord(storage)).toEqual({ shows: 2, used: true });
  });

  test("a repeat use writes nothing further", () => {
    const storage = fakeStorage();
    markUsed(storage);
    const writesAfterFirst = storage.setItem.mock.calls.length;

    markUsed(storage);

    expect(storage.setItem.mock.calls.length).toBe(writesAfterFirst);
  });
});
