import { expect, test } from "vitest";

import { isTap } from "./tap-detect";

const MAX = 8;

test("isTap treats a still release at the press point as a tap", () => {
  expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 }, MAX)).toBe(true);
});

test("isTap treats a small wobble within the tolerance as a tap", () => {
  expect(isTap({ x: 100, y: 100 }, { x: 104, y: 103 }, MAX)).toBe(true);
});

test("isTap treats a release beyond the tolerance as a spin", () => {
  expect(isTap({ x: 100, y: 100 }, { x: 100, y: 140 }, MAX)).toBe(false);
});

test("isTap measures straight-line distance, not per-axis", () => {
  expect(isTap({ x: 100, y: 100 }, { x: 106, y: 106 }, MAX)).toBe(false);
});
