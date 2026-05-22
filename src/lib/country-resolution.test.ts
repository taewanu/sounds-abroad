import { describe, expect, test } from "vitest";

import { resolveCountry } from "./country-resolution";

const ALL = ["us", "kr", "jp", "fr"] as const;

describe("country-resolution / resolveCountry", () => {
  test("returns URL param when valid", () => {
    const urlParam = "us";

    const result = resolveCountry({
      urlParam,
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0,
    });

    expect(result).toEqual({ code: urlParam, source: "url", didReset: false });
  });

  test("normalizes uppercase URL param to lowercase", () => {
    const urlParam = "KR";

    const result = resolveCountry({
      urlParam,
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0,
    });

    expect(result.code).toBe(urlParam.toLowerCase());
    expect(result.source).toBe("url");
  });

  test("falls through to random when URL param is invalid", () => {
    const result = resolveCountry({
      urlParam: "xx",
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0,
    });

    expect(result.source).toBe("random");
    expect(ALL).toContain(result.code);
  });

  test("falls through to random when URL param is null", () => {
    const result = resolveCountry({
      urlParam: null,
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0,
    });

    expect(result.source).toBe("random");
  });

  test("random excludes codes in visited", () => {
    const result = resolveCountry({
      urlParam: null,
      allCodes: ALL,
      visited: new Set(["us", "kr"]),
      rng: () => 0,
    });

    expect(result.source).toBe("random");
    expect(result.code).toBe("jp");
    expect(result.didReset).toBe(false);
  });

  test("signals reset and picks from full set when visited contains all codes", () => {
    const result = resolveCountry({
      urlParam: null,
      allCodes: ALL,
      visited: new Set(ALL),
      rng: () => 0,
    });

    expect(result.source).toBe("random");
    expect(result.code).toBe("us");
    expect(result.didReset).toBe(true);
  });

  test("rng near 1 picks the last candidate", () => {
    const result = resolveCountry({
      urlParam: null,
      allCodes: ALL,
      visited: new Set(),
      rng: () => 0.9999,
    });

    expect(result.code).toBe("fr");
  });
});
