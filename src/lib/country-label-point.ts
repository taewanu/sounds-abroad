import polylabel from 'polylabel';

import type { CountryRings } from './country-outlines';

export interface LatLon {
  lat: number;
  lon: number;
}

// One label is placed per country, so 0.05° (about 5 km) is finer than any name can show.
const PRECISION_DEG = 0.05;

/**
 * Returns the point of a country's largest landmass that lies farthest from every
 * border, so a name placed there sits on the land rather than at a coastal capital.
 * Rings are unwrapped around `near` and scaled by cos(latitude) so the search runs
 * on a local, roughly equal-distance plane instead of raw degrees.
 */
export function countryLabelPoint(rings: CountryRings, near: LatLon): LatLon {
  const xScale = Math.cos((near.lat * Math.PI) / 180);
  const plane = rings.map((ring) =>
    ring.map(([lon, lat]): [number, number] => [
      (lon - Math.round((lon - near.lon) / 360) * 360) * xScale,
      lat,
    ]),
  );
  // polylabel searches the first ring's bounding box and tests insideness by
  // even-odd over every ring, so the largest ring leads and holes still count.
  plane.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const [x, lat] = polylabel(plane, PRECISION_DEG);
  const lon = x / xScale;
  return { lat, lon: lon - Math.round(lon / 360) * 360 };
}

function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
