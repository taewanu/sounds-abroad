import { PerspectiveCamera, Vector3 } from "three";
import { expect, test } from "vitest";

import { COUNTRIES, type CountryEntry } from "@/lib/countries";
import { latLonToVec3 } from "@/lib/lat-lon-to-vec3";

import {
  addVisited,
  pickNearestToPoint,
  pickSnapCountry,
  projectFrontCountries,
  rankNearest,
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

  expect(pickNearestToPoint(candidates, 290, 310, 44)).toBe(mid.code);
});

test("pickNearestToPoint returns null when the nearest pin is beyond maxPx", () => {
  const [only] = COUNTRIES;
  const candidates = [screenAt(only, 100, 100)];

  expect(pickNearestToPoint(candidates, 200, 100, 44)).toBeNull();
});

test("pickNearestToPoint returns null when no candidates are given", () => {
  expect(pickNearestToPoint([], 0, 0, 44)).toBeNull();
});

test("rankNearest ranks the country under the rest direction first", () => {
  const target = COUNTRIES[0];

  const pool = rankNearest(target.lat * DEG, target.lon * DEG, 10);

  expect(pool[0].code).toBe(target.code);
});

test("rankNearest caps the pool at n", () => {
  expect(rankNearest(0, 0, 10)).toHaveLength(10);
  expect(rankNearest(0, 0, 5)).toHaveLength(5);
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

  expect(rankNearest(el, az, 10).map((e) => e.code)).toContain(result);
});

test("pickSnapCountry fair draw is deterministic under an injected rng", () => {
  // A dense region (the European cluster) keeps the whole pool inside the
  // fairness radius, so the injected draw maps linearly across all of it.
  const target = COUNTRIES.find((c) => c.code === "de")!;
  const el = target.lat * DEG;
  const az = target.lon * DEG;
  const pool = rankNearest(el, az, 10).map((e) => e.code);

  // No visits → uniform weights, so r maps linearly across the pool.
  expect(pickSnapCountry(el, az, new Set(), true, () => 0)).toBe(pool[0]);
  expect(pickSnapCountry(el, az, new Set(), true, () => 0.95)).toBe(pool[9]);
});

test("over open water the fair snap holds the nearest country, never a far shore", () => {
  // A mid-ocean rest point: every country is well beyond the fairness radius,
  // so the pool straddles both coasts. The draw must collapse to the single
  // nearest rather than randomly lurching across to the far shore.
  const el = 10 * DEG;
  const az = -150 * DEG;
  const nearest = rankNearest(el, az, 10)[0].code;

  for (let r = 0; r < 1; r += 0.1) {
    expect(pickSnapCountry(el, az, new Set(), true, () => r)).toBe(nearest);
  }
});

test("every country appears in some nearest pool over the reachable sphere", () => {
  const POOL_SIZE = 10; // mirrors the snap pool size in spin-select.ts
  const EL_LIMIT = 75 * DEG; // the spin elevation clamp
  const STEP = 1.5 * DEG;
  const reached = new Set<string>();

  for (let el = -EL_LIMIT; el <= EL_LIMIT; el += STEP) {
    for (let az = -Math.PI; az < Math.PI; az += STEP) {
      for (const entry of rankNearest(el, az, POOL_SIZE)) {
        reached.add(entry.code);
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
