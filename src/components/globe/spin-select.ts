import type { Camera } from "three";
import { Vector3 } from "three";

import { COUNTRIES, type CountryEntry } from "@/lib/countries";
import { weightedDraw } from "@/lib/fairness-draw";
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

// Tap target: the front-facing country whose pin is nearest the tap point, or
// null when even the nearest pin is farther than `maxPx` (a tap on open ocean
// selects nothing). `bestDist` is a squared pixel distance.
export function pickNearestToPoint(
  candidates: readonly ScreenCountry[],
  px: number,
  py: number,
  maxPx: number,
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
  // Near enough → that country; beyond the radius → nothing. Comparison stays
  // in squared space (bestDist is squared) to skip a sqrt.
  return bestDist <= maxPx ** 2 ? best : null;
}

export interface PoolEntry {
  code: string;
  // Angular distance (radians) from the rest direction; 0 means dead centre.
  angle: number;
}

// Countries ranked by how closely they face the rest direction (el, az in
// radians), nearest first, capped at `n`, each tagged with its angular
// distance. This is the fling's candidate pool: geography narrows the choice
// to a neighbourhood, and the distance lets fairness pick only within a genuine
// cluster instead of across open water.
export function rankNearest(el: number, az: number, n: number): PoolEntry[] {
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
    // dot is cos(angle) for unit vectors; clamp guards acos against fp drift.
    return { code: c.code, angle: Math.acos(Math.min(1, Math.max(-1, dot))) };
  })
    .sort((a, b) => a.angle - b.angle)
    .slice(0, n);
}

const SNAP_POOL = 10; // candidate countries near the rest point for a fair snap
// Past this angle (radians) from the rest direction a country is across open
// water, not a near neighbour. Beyond it fairness has no genuine cluster to
// randomise over, so the snap takes the single nearest and never lurches across
// an ocean to the far shore.
const SNAP_NEAR = 18 * DEG;

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
  const ranked = rankNearest(el, az, SNAP_POOL);
  if (!fair) return ranked[0].code;

  // Fairness only randomises within a genuine neighbourhood. Over open water
  // nothing sits within SNAP_NEAR, so the pool would straddle both shores;
  // there we take the single nearest for a predictable in-place landing rather
  // than a random lurch to the far coast.
  const near = ranked.filter((e) => e.angle <= SNAP_NEAR);
  if (near.length === 0) return ranked[0].code;
  return weightedDraw(
    near.map((e) => e.code),
    visited,
    rng(),
  );
}
