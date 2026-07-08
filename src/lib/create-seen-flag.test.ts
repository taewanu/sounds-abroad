import { afterEach, describe, expect, test, vi } from "vitest";

import { createSeenFlag } from "./create-seen-flag";

const KEY = "sounds-abroad:test-flag:v1";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("hasSeen", () => {
  test("is false when nothing is stored", () => {
    expect(createSeenFlag(KEY).hasSeen(fakeStorage())).toBe(false);
  });

  test("is true once the flag is set", () => {
    expect(createSeenFlag(KEY).hasSeen(fakeStorage({ [KEY]: "1" }))).toBe(true);
  });

  test("treats any other stored value as not seen", () => {
    expect(createSeenFlag(KEY).hasSeen(fakeStorage({ [KEY]: "yes" }))).toBe(
      false,
    );
  });

  test("keys each flag by its own key, so a sibling flag's value doesn't leak", () => {
    const seed = fakeStorage({ "sounds-abroad:other:v1": "1" });

    expect(createSeenFlag(KEY).hasSeen(seed)).toBe(false);
  });

  test("returns false instead of throwing when reading throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: vi.fn(),
    };

    expect(createSeenFlag(KEY).hasSeen(hostile)).toBe(false);
  });
});

describe("markSeen", () => {
  test("records the flag so a later read sees it", () => {
    const flag = createSeenFlag(KEY);
    const storage = fakeStorage();

    flag.markSeen(storage);

    expect(flag.hasSeen(storage)).toBe(true);
  });

  test("swallows a failing write rather than throwing", () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(() => createSeenFlag(KEY).markSeen(hostile)).not.toThrow();
  });
});

describe("subscribe", () => {
  test("notifies a subscriber when the flag is marked seen", () => {
    const flag = createSeenFlag(KEY);
    const onChange = vi.fn();
    const unsubscribe = flag.subscribe(onChange);

    flag.markSeen(fakeStorage());

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test("notifies even when persisting the flag throws, so the handoff fires", () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    const flag = createSeenFlag(KEY);
    const onChange = vi.fn();
    const unsubscribe = flag.subscribe(onChange);

    flag.markSeen(hostile);

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test("stops notifying after unsubscribe", () => {
    const flag = createSeenFlag(KEY);
    const onChange = vi.fn();

    flag.subscribe(onChange)();
    flag.markSeen(fakeStorage());

    expect(onChange).not.toHaveBeenCalled();
  });

  test("scopes subscribers to their own flag instance", () => {
    const onChange = vi.fn();
    createSeenFlag(KEY).subscribe(onChange);

    createSeenFlag(KEY).markSeen(fakeStorage());

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("falls back to the in-memory mirror when localStorage throws", () => {
  test("round-trips through the mirror when access throws (private mode)", () => {
    // Restore in finally, not afterEach: a leaked spy would make the next
    // suite's localStorage throw and read the mirror instead.
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
      const flag = createSeenFlag(KEY);
      expect(flag.hasSeen()).toBe(false);

      flag.markSeen();

      expect(flag.hasSeen()).toBe(true);
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

  test("round-trips when no storage is injected", () => {
    const flag = createSeenFlag(KEY);
    expect(flag.hasSeen()).toBe(false);

    flag.markSeen();

    expect(flag.hasSeen()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("1");
  });
});
