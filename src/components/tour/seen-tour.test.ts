import { afterEach, describe, expect, test, vi } from "vitest";

import { hasSeenTour, markTourSeen, subscribeSeenTour } from "./seen-tour";

const KEY = "sounds-abroad:tour-seen:v1";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("hasSeenTour", () => {
  test("is false when nothing is stored", () => {
    expect(hasSeenTour(fakeStorage())).toBe(false);
  });

  test("is true once the flag is set", () => {
    expect(hasSeenTour(fakeStorage({ [KEY]: "1" }))).toBe(true);
  });

  test("treats any other stored value as not seen", () => {
    expect(hasSeenTour(fakeStorage({ [KEY]: "yes" }))).toBe(false);
  });

  test("returns false instead of throwing when reading throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: vi.fn(),
    };

    expect(hasSeenTour(hostile)).toBe(false);
  });
});

describe("markTourSeen", () => {
  test("records the flag so a later read sees it", () => {
    const storage = fakeStorage();

    markTourSeen(storage);

    expect(hasSeenTour(storage)).toBe(true);
  });

  test("swallows a failing write rather than throwing", () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(() => markTourSeen(hostile)).not.toThrow();
  });
});

describe("subscribeSeenTour", () => {
  test("notifies a subscriber when the tour is marked seen", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeSeenTour(onChange);

    markTourSeen(fakeStorage());

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
    const onChange = vi.fn();
    const unsubscribe = subscribeSeenTour(onChange);

    markTourSeen(hostile);

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test("stops notifying after unsubscribe", () => {
    const onChange = vi.fn();

    subscribeSeenTour(onChange)();
    markTourSeen(fakeStorage());

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
      expect(hasSeenTour()).toBe(false);

      markTourSeen();

      expect(hasSeenTour()).toBe(true);
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

describe("seen-tour through the real localStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  test("round-trips when no storage is injected", () => {
    expect(hasSeenTour()).toBe(false);

    markTourSeen();

    expect(hasSeenTour()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("1");
  });
});
