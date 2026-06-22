import { expect, test } from "vitest";

import { flickToSpin } from "./spin-feel";

test("flickToSpin maps a still release to no spin", () => {
  expect(flickToSpin(0)).toBe(0);
});

test("flickToSpin preserves the sign of the flick direction", () => {
  const speed = 0.3;

  expect(flickToSpin(speed)).toBeGreaterThan(0);
  expect(flickToSpin(-speed)).toBe(-flickToSpin(speed));
});

test("flickToSpin scales the spin proportionally to the flick speed", () => {
  const speed = 0.25;

  expect(flickToSpin(2 * speed)).toBeCloseTo(2 * flickToSpin(speed));
});
