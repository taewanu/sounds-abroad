import { expect, test } from "vitest";

import { latLonToVec3 } from "./lat-lon-to-vec3";

test("latLonToVec3 maps origin (0°, 0°) to (0, 0, 1) at unit radius", () => {
  const v = latLonToVec3(0, 0);

  expect(v.x).toBeCloseTo(0, 10);
  expect(v.y).toBeCloseTo(0, 10);
  expect(v.z).toBeCloseTo(1, 10);
});

test("latLonToVec3 maps north pole (90°, 0°) to (0, 1, 0)", () => {
  const v = latLonToVec3(90, 0);

  expect(v.x).toBeCloseTo(0, 10);
  expect(v.y).toBeCloseTo(1, 10);
  expect(v.z).toBeCloseTo(0, 10);
});

test("latLonToVec3 maps (0°, 90°) to (1, 0, 0) — longitude 90° points to +X", () => {
  const v = latLonToVec3(0, 90);

  expect(v.x).toBeCloseTo(1, 10);
  expect(v.y).toBeCloseTo(0, 10);
  expect(v.z).toBeCloseTo(0, 10);
});

test("latLonToVec3 scales output by radius parameter", () => {
  const v = latLonToVec3(0, 0, 2);

  expect(v.x).toBeCloseTo(0, 10);
  expect(v.y).toBeCloseTo(0, 10);
  expect(v.z).toBeCloseTo(2, 10);
});
