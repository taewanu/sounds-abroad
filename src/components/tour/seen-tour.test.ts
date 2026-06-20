import { afterEach, describe, expect, test, vi } from "vitest";

import { hasSeenTour, markTourSeen } from "./seen-tour";

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
