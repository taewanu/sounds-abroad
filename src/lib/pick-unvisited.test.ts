import { describe, expect, test } from "vitest";

import { pickUnvisited } from "./pick-unvisited";

const ALL = ["us", "kr", "jp", "fr"] as const;

describe("pickUnvisited", () => {
  test("picks from the full set when nothing is visited", () => {
    const result = pickUnvisited({
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0,
    });

    expect(result.code).toBe("us");
    expect(result.didReset).toBe(false);
  });

  test("excludes codes in visited", () => {
    const result = pickUnvisited({
      allCodes: ALL,
      visited: new Set(["us", "kr"]),
      rng: () => 0,
    });

    expect(result.code).toBe("jp");
    expect(result.didReset).toBe(false);
  });

  test("signals reset and picks from the full set when visited contains all codes", () => {
    const result = pickUnvisited({
      allCodes: ALL,
      visited: new Set(ALL),
      rng: () => 0,
    });

    expect(result.code).toBe("us");
    expect(result.didReset).toBe(true);
  });

  test("rng near 1 picks the last candidate", () => {
    const result = pickUnvisited({
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0.9999,
    });

    expect(result.code).toBe("fr");
  });
});
