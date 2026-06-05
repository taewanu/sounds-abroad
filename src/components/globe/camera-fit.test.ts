import { expect, test } from "vitest";

import { cameraForViewport } from "./camera-fit";

const BASE_FOV = 45;
const BASE_DISTANCE = 3.5;

function shorterDimensionFill(aspect: number): number {
  const { fov, distance } = cameraForViewport(aspect);
  const halfExtent =
    distance * Math.tan((fov / 2) * (Math.PI / 180)) * Math.min(1, aspect);
  return 1 / halfExtent;
}

test("cameraForViewport narrows the FOV on a wide-and-short viewport", () => {
  const { fov, distance } = cameraForViewport(2);

  expect(fov).toBeLessThan(BASE_FOV);
  expect(distance).toBe(BASE_DISTANCE);
});

test("cameraForViewport clamps a tall viewport to the base FOV", () => {
  const { fov, distance } = cameraForViewport(0.46);

  expect(fov).toBe(BASE_FOV);
  expect(distance).toBe(BASE_DISTANCE);
});

test("cameraForViewport holds the base distance at every aspect", () => {
  for (const aspect of [0.4, 0.8, 1, 1.6, 2.4]) {
    expect(cameraForViewport(aspect).distance).toBe(BASE_DISTANCE);
  }
});

test.each([0.85, 1, 1.5, 2, 3])(
  "cameraForViewport fills ~85%% of the shorter dimension at aspect %s",
  (aspect) => {
    expect(shorterDimensionFill(aspect)).toBeCloseTo(0.85, 2);
  },
);

test("cameraForViewport never widens past the base FOV", () => {
  for (const aspect of [0.2, 0.46, 0.81, 1, 2]) {
    expect(cameraForViewport(aspect).fov).toBeLessThanOrEqual(BASE_FOV);
  }
});
