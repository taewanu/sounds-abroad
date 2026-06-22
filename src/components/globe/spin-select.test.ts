import { PerspectiveCamera, Vector3 } from "three";
import { expect, test } from "vitest";

import { COUNTRIES, type CountryEntry } from "@/lib/countries";
import { latLonToVec3 } from "@/lib/lat-lon-to-vec3";

import {
  addVisited,
  nearestPool,
  pickNearestToPoint,
  pickSnapCountry,
  projectFrontCountries,
  weightedDraw,
} from "./spin-select";

const GLOBE_RADIUS = 3.5;
const DEG = Math.PI / 180;

function directionOf(code: string): Vector3 {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) throw new Error(`unknown country code: ${code}`);
  return latLonToVec3(country.lat, country.lon, 1).normalize();
}

// A camera looking at the globe centre from `direction`, with its matrices
// updated so projection math is valid.
function cameraFacing(direction: Vector3): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.copy(
    direction.clone().normalize().multiplyScalar(GLOBE_RADIUS),
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function farthestFrom(direction: Vector3): string {
  let farthest = COUNTRIES[0].code;
  let minDot = Infinity;
  for (const country of COUNTRIES) {
    const dot = directionOf(country.code).dot(direction);
    if (dot < minDot) {
      minDot = dot;
      farthest = country.code;
    }
  }
  return farthest;
}

function screenAt(country: CountryEntry, sx: number, sy: number) {
  return { country, sx, sy };
}

test("projectFrontCountries keeps the faced country and drops its far-side opposite", () => {
  const faced = COUNTRIES[0];
  const facedDirection = directionOf(faced.code);
  const opposite = farthestFrom(facedDirection);

  const codes = projectFrontCountries(
    cameraFacing(facedDirection),
    800,
    600,
  ).map((screen) => screen.country.code);

  expect(codes).toContain(faced.code);
  expect(codes).not.toContain(opposite);
});

test("pickNearestToPoint returns the candidate closest to the tap point", () => {
  const [near, mid, far] = COUNTRIES;
  const candidates = [
    screenAt(near, 100, 100),
    screenAt(mid, 300, 300),
    screenAt(far, 500, 100),
  ];

  expect(pickNearestToPoint(candidates, 290, 310)).toBe(mid.code);
});

test("pickNearestToPoint returns null when no candidates are given", () => {
  expect(pickNearestToPoint([], 0, 0)).toBeNull();
});

test("nearestPool ranks the country under the rest direction first", () => {
  const target = COUNTRIES[0];

  const pool = nearestPool(target.lat * DEG, target.lon * DEG, 10);

  expect(pool[0]).toBe(target.code);
});

test("nearestPool caps the pool at n", () => {
  expect(nearestPool(0, 0, 10)).toHaveLength(10);
  expect(nearestPool(0, 0, 5)).toHaveLength(5);
});

test("weightedDraw overwhelmingly prefers an unvisited country in the pool", () => {
  const [seen, unseen] = COUNTRIES;
  const pool = [seen.code, unseen.code];
  const visited = new Set([seen.code]);

  for (const r of [0.1, 0.5, 0.9]) {
    expect(weightedDraw(pool, visited, r)).toBe(unseen.code);
  }
});

test("weightedDraw flattens to a uniform draw once every pool member is visited", () => {
  const [first, second] = COUNTRIES;
  const pool = [first.code, second.code];
  const visited = new Set([first.code, second.code]);

  expect(weightedDraw(pool, visited, 0.25)).toBe(first.code);
  expect(weightedDraw(pool, visited, 0.75)).toBe(second.code);
});

test("pickSnapCountry returns the literal nearest country when fairness is off", () => {
  const target = COUNTRIES[0];

  const result = pickSnapCountry(
    target.lat * DEG,
    target.lon * DEG,
    new Set(),
    false,
  );

  expect(result).toBe(target.code);
});

test("pickSnapCountry returns a country from the nearest pool when fairness is on", () => {
  const target = COUNTRIES[0];
  const el = target.lat * DEG;
  const az = target.lon * DEG;

  const result = pickSnapCountry(el, az, new Set(), true);

  expect(nearestPool(el, az, 10)).toContain(result);
});

test("pickSnapCountry fair draw is deterministic under an injected rng", () => {
  const target = COUNTRIES[0];
  const el = target.lat * DEG;
  const az = target.lon * DEG;
  const pool = nearestPool(el, az, 10);

  // No visits → uniform weights, so r maps linearly across the pool.
  expect(pickSnapCountry(el, az, new Set(), true, () => 0)).toBe(pool[0]);
  expect(pickSnapCountry(el, az, new Set(), true, () => 0.95)).toBe(pool[9]);
});

test("every country appears in some nearest pool over the reachable sphere", () => {
  const POOL_SIZE = 10; // mirrors the snap pool size in spin-select.ts
  const EL_LIMIT = 75 * DEG; // the spin elevation clamp
  const STEP = 1.5 * DEG;
  const reached = new Set<string>();

  for (let el = -EL_LIMIT; el <= EL_LIMIT; el += STEP) {
    for (let az = -Math.PI; az < Math.PI; az += STEP) {
      for (const code of nearestPool(el, az, POOL_SIZE)) {
        reached.add(code);
      }
    }
  }

  const unreachable = COUNTRIES.filter((c) => !reached.has(c.code)).map(
    (c) => c.code,
  );
  expect(unreachable).toEqual([]);
});

test("addVisited records a newly settled country in the visited set", () => {
  const result = addVisited(new Set(["us"]), "kr");

  expect([...result].sort()).toEqual(["kr", "us"]);
});

test("addVisited returns the same set when the country is already visited", () => {
  const visited = new Set(["us"]);

  expect(addVisited(visited, "us")).toBe(visited);
});
