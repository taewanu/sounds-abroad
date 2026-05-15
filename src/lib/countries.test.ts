import { expect, test } from "vitest";

import { COUNTRIES } from "./countries";

test("has 40 entries", () => {
  expect(COUNTRIES).toHaveLength(40);
});

test("country codes are unique", () => {
  const codes = COUNTRIES.map((c) => c.code);
  expect(new Set(codes).size).toBe(codes.length);
});

test("country codes are lowercase ISO 3166-1 alpha-2", () => {
  for (const c of COUNTRIES) {
    expect(c.code).toMatch(/^[a-z]{2}$/);
  }
});
