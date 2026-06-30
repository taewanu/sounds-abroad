import { expect, test } from "vitest";

import { horizontalThird, isTap } from "./tap-detect";

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

const WIDTH = 300;

test("horizontalThird reads a point in the first third as left", () => {
  expect(horizontalThird(50, WIDTH)).toBe("left");
});

test("horizontalThird reads a point in the middle third as center", () => {
  expect(horizontalThird(150, WIDTH)).toBe("center");
});

test("horizontalThird reads a point in the last third as right", () => {
  expect(horizontalThird(250, WIDTH)).toBe("right");
});

test("horizontalThird leans the left boundary into the center", () => {
  expect(horizontalThird(WIDTH / 3, WIDTH)).toBe("center");
});

test("horizontalThird leans the right boundary into the right zone", () => {
  expect(horizontalThird((WIDTH * 2) / 3, WIDTH)).toBe("right");
});
