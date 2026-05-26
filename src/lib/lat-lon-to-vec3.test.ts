import { expect, test } from "vitest";

import { latLonToVec3, vec3ToLatLon } from "./lat-lon-to-vec3";

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

test.each([
  { name: "Seoul", lat: 37.57, lon: 126.98 },
  { name: "NYC", lat: 40.71, lon: -74.0 },
  { name: "Sydney", lat: -33.87, lon: 151.21 },
  { name: "Cape Town", lat: -33.92, lon: 18.42 },
])("vec3ToLatLon round-trips $name (lat=$lat, lon=$lon)", ({ lat, lon }) => {
  const v = latLonToVec3(lat, lon);
  const result = vec3ToLatLon(v);

  expect(result.lat).toBeCloseTo(lat, 10);
  expect(result.lon).toBeCloseTo(lon, 10);
});
