import { beforeEach, describe, expect, test, vi } from "vitest";

import { markVisited, readVisited, resetVisited } from "./visited-storage";

describe("visited-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("readVisited returns empty set when no value stored", () => {
    expect(readVisited().size).toBe(0);
  });

  test("markVisited then readVisited round-trips a single code", () => {
    markVisited("us");

    const visited = readVisited();
    expect(visited.has("us")).toBe(true);
    expect(visited.size).toBe(1);
  });

  test("markVisited accumulates multiple codes without duplicates", () => {
    markVisited("us");
    markVisited("kr");
    markVisited("us");

    const visited = readVisited();
    expect(visited.size).toBe(2);
    expect(visited.has("us")).toBe(true);
    expect(visited.has("kr")).toBe(true);
  });

  test("resetVisited empties the stored set", () => {
    markVisited("us");
    markVisited("kr");

    resetVisited();

    expect(readVisited().size).toBe(0);
  });

  test("readVisited returns empty set when stored value is malformed JSON", () => {
    localStorage.setItem("sa:visited", "not-json");

    expect(readVisited().size).toBe(0);
  });

  test("readVisited returns empty set when localStorage is undefined (SSR)", () => {
    vi.stubGlobal("localStorage", undefined);
    try {
      expect(readVisited().size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
