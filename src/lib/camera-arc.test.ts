import { Vector3 } from "three";
import { expect, test } from "vitest";

import { cameraArcPath } from "./camera-arc";
import { latLonToVec3 } from "./lat-lon-to-vec3";

const cameraStart = new Vector3(0, 0, 3.5);
const targetLatLon = { lat: -22.9, lon: -43.2 };
const baseRadius = cameraStart.length();
const riseFactor = 0.15;
const EPSILON = 1e-6;
const path = cameraArcPath({
  from: cameraStart,
  toLatLon: targetLatLon,
  baseRadius,
  riseFactor,
});

test("cameraArcPath starts at the input camera position", () => {
  const start = path(0);

  expect(start.x).toBeCloseTo(cameraStart.x, 6);
  expect(start.y).toBeCloseTo(cameraStart.y, 6);
  expect(start.z).toBeCloseTo(cameraStart.z, 6);
});

test("cameraArcPath ends in the target lat/lon direction at the same distance", () => {
  const end = path(1);

  const target = latLonToVec3(targetLatLon.lat, targetLatLon.lon, baseRadius);
  expect(end.x).toBeCloseTo(target.x, 6);
  expect(end.y).toBeCloseTo(target.y, 6);
  expect(end.z).toBeCloseTo(target.z, 6);
});

test("cameraArcPath midpoint rises to baseRadius × (1 + riseFactor)", () => {
  const mid = path(0.5);

  expect(mid.length()).toBeCloseTo(baseRadius * (1 + riseFactor), 6);
});

test("cameraArcPath midpoint lies on the great circle from start to target", () => {
  const fromDir = cameraStart.clone().normalize();
  const toDir = latLonToVec3(targetLatLon.lat, targetLatLon.lon, 1);
  const arcAxis = new Vector3().crossVectors(fromDir, toDir).normalize();

  const mid = path(0.5);

  expect(Math.abs(mid.dot(arcAxis))).toBeLessThan(EPSILON);
});
