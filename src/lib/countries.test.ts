import { expect, test } from "vitest";

import { COUNTRIES } from "./countries";

test("country codes are unique", () => {
  const codes = COUNTRIES.map((c) => c.code);
  expect(new Set(codes).size).toBe(codes.length);
});

test("country codes are lowercase ISO 3166-1 alpha-2", () => {
  for (const c of COUNTRIES) {
    expect(c.code).toMatch(/^[a-z]{2}$/);
  }
});

test("every country has latitude in [-90, 90]", () => {
  for (const c of COUNTRIES) {
    expect(c.lat).toBeGreaterThanOrEqual(-90);
    expect(c.lat).toBeLessThanOrEqual(90);
  }
});

test("every country has longitude in [-180, 180]", () => {
  for (const c of COUNTRIES) {
    expect(c.lon).toBeGreaterThanOrEqual(-180);
    expect(c.lon).toBeLessThanOrEqual(180);
  }
});

test("isoNum codes are unique", () => {
  const codes = COUNTRIES.map((c) => c.isoNum);
  expect(new Set(codes).size).toBe(codes.length);
});

test("isoNum is positive integer in [1, 999]", () => {
  for (const c of COUNTRIES) {
    expect(Number.isInteger(c.isoNum)).toBe(true);
    expect(c.isoNum).toBeGreaterThanOrEqual(1);
    expect(c.isoNum).toBeLessThanOrEqual(999);
  }
});
