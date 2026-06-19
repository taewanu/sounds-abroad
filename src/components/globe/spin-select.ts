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

const SNAP_POOL = 10; // countries near the rest point considered for a fair snap
const VISITED_WEIGHT = 0.08; // how strongly an already-seen country is avoided

// Snap target at the end of a fling. Ranks countries by nearness to the point
// the camera faces (el, az radians). With fairness off, returns the literal
// nearest. With fairness on, draws from the nearest pool weighted away from
// already-visited countries, so a tiny country wedged between big neighbours
// still gets its turn instead of always losing to them.
export function pickSnapCountry(
  el: number,
  az: number,
  visited: ReadonlySet<string>,
  fair: boolean,
): string {
  const cx = Math.cos(el) * Math.sin(az);
  const cy = Math.sin(el);
  const cz = Math.cos(el) * Math.cos(az);
  const ranked = COUNTRIES.map((c) => {
    const lat = c.lat * DEG;
    const lon = c.lon * DEG;
    const dot =
      Math.cos(lat) * Math.sin(lon) * cx +
      Math.sin(lat) * cy +
      Math.cos(lat) * Math.cos(lon) * cz;
    return { code: c.code, dot };
  }).sort((a, b) => b.dot - a.dot);

  if (!fair) return ranked[0].code;

  const pool = ranked.slice(0, SNAP_POOL);
  const weights = pool.map((p) => (visited.has(p.code) ? VISITED_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].code;
  }
  return pool[0].code;
}
