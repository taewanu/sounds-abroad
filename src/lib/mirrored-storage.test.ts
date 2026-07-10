import { afterEach, describe, expect, test, vi } from "vitest";

import { createMirroredStorage } from "./mirrored-storage";

const KEY = "sounds-abroad:mirror-test";

describe("createMirroredStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  test("round-trips through the real localStorage when available", () => {
    const storage = createMirroredStorage();

    storage.setItem(KEY, "value");

    expect(storage.getItem(KEY)).toBe("value");
    expect(localStorage.getItem(KEY)).toBe("value");
  });

  test("is null for an unset key", () => {
    expect(createMirroredStorage().getItem(KEY)).toBeNull();
  });

  test("falls back to the in-memory mirror when access throws (private mode)", () => {
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
      const storage = createMirroredStorage();
      expect(storage.getItem(KEY)).toBeNull();

      storage.setItem(KEY, "value");

      expect(storage.getItem(KEY)).toBe("value");
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
