import { afterEach, describe, expect, test, vi } from "vitest";

import { emptyRecord, type TourRecord } from "./tour-record";
import { readRecord, subscribeRecord, writeRecord } from "./tour-record-store";

const KEY = "sounds-abroad:tour:v2";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("readRecord", () => {
  test("is the empty record when nothing is stored (a fresh v2 key)", () => {
    expect(readRecord(fakeStorage())).toEqual(emptyRecord);
  });

  test("round-trips a written record", () => {
    const record: TourRecord = {
      learned: ["gesture", "sheet"],
      shows: 1,
      dismissed: false,
    };
    const storage = fakeStorage();

    writeRecord(record, storage);

    expect(readRecord(storage)).toEqual(record);
  });

  test("falls back to the empty record on corrupt JSON rather than throwing", () => {
    expect(readRecord(fakeStorage({ [KEY]: "{not json" }))).toEqual(
      emptyRecord,
    );
  });

  test("drops unknown values from learned so a stale key can't inject junk beats", () => {
    const stored = JSON.stringify({
      learned: ["gesture", "skip", "bogus"],
      shows: 1,
      dismissed: false,
    });

    expect(readRecord(fakeStorage({ [KEY]: stored })).learned).toEqual([
      "gesture",
    ]);
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
});

describe("subscribeRecord", () => {
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

describe("falls back to the in-memory mirror when localStorage throws", () => {
  test("round-trips through the mirror when access throws (private mode)", () => {
    const getSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      const record: TourRecord = {
        learned: ["audio"],
        shows: 2,
        dismissed: true,
      };
      expect(readRecord()).toEqual(emptyRecord);

      writeRecord(record);

      expect(readRecord()).toEqual(record);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

describe("through the real localStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  test("persists under the v2 key", () => {
    const record: TourRecord = {
      learned: ["gesture"],
      shows: 1,
      dismissed: false,
    };

    writeRecord(record);

    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(record));
  });
});
