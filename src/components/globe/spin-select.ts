import type { Camera } from "three";
import { Vector3 } from "three";

import { COUNTRIES, type CountryEntry } from "@/lib/countries";
import { latLonToVec3 } from "@/lib/lat-lon-to-vec3";

const DEG = Math.PI / 180;
const PIN_ELEVATION = 1.015;
// Drop pins near or behind the limb: their projection overlaps the front face.
const FRONT_DOT_MIN = 0.1;

const WORLD_BY_CODE = new Map<string, Vector3>(
  COUNTRIES.map((c) => [c.code, latLonToVec3(c.lat, c.lon, PIN_ELEVATION)]),
);

export interface ScreenCountry {
  country: CountryEntry;
  sx: number;
  sy: number;
}

// Countries on the camera-facing hemisphere, projected to canvas pixel space
// (origin top-left, y down) so a tap point and a pin share one frame.
export function projectFrontCountries(
  camera: Camera,
  width: number,
  height: number,
): ScreenCountry[] {
  const camDir = camera.position.clone().normalize();
  const result: ScreenCountry[] = [];
  for (const country of COUNTRIES) {
    const world = WORLD_BY_CODE.get(country.code);
    if (!world) continue;
    if (world.clone().normalize().dot(camDir) <= FRONT_DOT_MIN) continue;
    const ndc = world.clone().project(camera);
    result.push({
      country,
      sx: ((ndc.x + 1) / 2) * width,
      sy: ((1 - ndc.y) / 2) * height,
    });
  }
  return result;
}

// Tap target: the front-facing country whose pin is nearest the tap point.
export function pickNearestToPoint(
  candidates: readonly ScreenCountry[],
  px: number,
  py: number,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = (c.sx - px) ** 2 + (c.sy - py) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c.country.code;
    }
  }
  return best;
}

// Country codes ranked by how closely they face the rest direction (el, az in
// radians), nearest first, capped at `n`. This is the fling's candidate pool:
// geography narrows the choice to a neighbourhood before fairness picks within it.
export function nearestPool(el: number, az: number, n: number): string[] {
  const cx = Math.cos(el) * Math.sin(az);
  const cy = Math.sin(el);
  const cz = Math.cos(el) * Math.cos(az);
  return COUNTRIES.map((c) => {
    const lat = c.lat * DEG;
    const lon = c.lon * DEG;
    const dot =
      Math.cos(lat) * Math.sin(lon) * cx +
      Math.sin(lat) * cy +
      Math.cos(lat) * Math.cos(lon) * cz;
    return { code: c.code, dot };
  })
    .sort((a, b) => b.dot - a.dot)
    .slice(0, n)
    .map((entry) => entry.code);
}

const VISITED_WEIGHT = 0.08; // how strongly an already-seen country is avoided

// Weighted random draw from `pool`, biased away from already-visited countries
// so the same few do not repeat. `r` (in [0, 1)) is the injected draw position,
// so the bias stays testable without stubbing Math.random.
export function weightedDraw(
  pool: readonly string[],
  visited: ReadonlySet<string>,
  r: number,
): string {
  const weights = pool.map((code) => (visited.has(code) ? VISITED_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let position = r * total;
  for (let i = 0; i < pool.length; i++) {
    position -= weights[i];
    if (position <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

const SNAP_POOL = 10; // candidate countries near the rest point for a fair snap

// Fling target. Fairness off: the literal nearest country to the rest direction.
// Fairness on: a deck-weighted draw from the nearest pool, so a small country
// wedged between big neighbours still gets its turn. Randomness enters here via
// `rng` (defaults to Math.random), injected so the fair path stays testable too.
export function pickSnapCountry(
  el: number,
  az: number,
  visited: ReadonlySet<string>,
  fair: boolean,
  rng: () => number = Math.random,
): string {
  const pool = nearestPool(el, az, SNAP_POOL);
  if (!fair) return pool[0];
  return weightedDraw(pool, visited, rng());
}
