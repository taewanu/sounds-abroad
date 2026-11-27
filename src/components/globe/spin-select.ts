import type { Camera } from 'three';
import { Raycaster, Sphere, Vector2, Vector3 } from 'three';

import { COUNTRIES, type CountryEntry } from '@/lib/countries';
import { weightedDraw } from '@/lib/fairness-draw';
import { latLonToVec3 } from '@/lib/lat-lon-to-vec3';

const DEG = Math.PI / 180;
// A cursor farther than this from every visible country centre hovers nothing.
const HOVER_HIT_PX = 44;
const GLOBE = new Sphere(new Vector3(), 1);

const CENTRES = COUNTRIES.map((country) => ({
  country,
  centre: latLonToVec3(country.lat, country.lon),
}));

export interface ScreenCountry {
  country: CountryEntry;
  sx: number;
  sy: number;
}

// Countries whose centre the camera can see, projected to canvas pixel space
// (origin top-left, y down) so a cursor point and a centre share one frame.
export function projectFrontCountries(
  camera: Camera,
  width: number,
  height: number,
): ScreenCountry[] {
  const result: ScreenCountry[] = [];
  for (const { country, centre } of CENTRES) {
    // A point on the unit globe is visible only while the camera sits above its tangent plane.
    if (centre.dot(camera.position) <= 1) continue;
    const ndc = centre.clone().project(camera);
    result.push({
      country,
      sx: ((ndc.x + 1) / 2) * width,
      sy: ((1 - ndc.y) / 2) * height,
    });
  }
  return result;
}

// The candidate nearest the point, or null when even the nearest is farther
// than `maxPx`. `bestDist` is a squared pixel distance.
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

// The country a cursor at canvas point (x, y) hovers, or null when the cursor
// is off the globe or no visible centre is within HOVER_HIT_PX of it.
export function pickHoverCountry(
  camera: Camera,
  width: number,
  height: number,
  x: number,
  y: number,
): string | null {
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
  if (!raycaster.ray.intersectsSphere(GLOBE)) return null;
  return pickNearestToPoint(projectFrontCountries(camera, width, height), x, y, HOVER_HIT_PX);
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
      Math.cos(lat) * Math.sin(lon) * cx + Math.sin(lat) * cy + Math.cos(lat) * Math.cos(lon) * cz;
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

// Step sweep resolution: a coarser one skips small neighbours, while this one
// misses only a cell that the row crosses for less than its width.
export const STEP_SWEEP = 0.1 * DEG;

// A step sweeps from (el, az) along that latitude toward `dir` (-1 west, 1 east)
// until the nearest country changes, and returns that country with the azimuth
// where the sweep entered it so the next step continues the same row.
export function pickStep(el: number, az: number, dir: 1 | -1): { code: string; az: number } {
  const from = rankNearest(el, az, 1)[0].code;
  for (let offset = STEP_SWEEP; offset < 2 * Math.PI; offset += STEP_SWEEP) {
    const at = az + dir * offset;
    const code = rankNearest(el, at, 1)[0].code;
    if (code !== from) return { code, az: at };
  }
  return { code: from, az };
}
