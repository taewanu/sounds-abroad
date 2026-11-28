import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GeometryCollection, Topology } from 'topojson-specification';
import { expect, test } from 'vitest';

import { COUNTRIES } from './countries';
import { countryLabelPoint, type LatLon } from './country-label-point';
import { buildCountryOutlines, type CountryRings } from './country-outlines';

const outlines = buildCountryOutlines(
  JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/countries-50m.json'), 'utf-8'),
  ) as Topology<{ countries: GeometryCollection }>,
);

// Even-odd ray cast over every ring, so a point inside an enclosed hole counts as outside.
function isInside(rings: CountryRings, { lat, lon }: LatLon): boolean {
  let inside = false;
  for (const ring of rings) {
    const local = ring.map(([x, y]) => [x - Math.round((x - lon) / 360) * 360, y]);
    for (let i = 0, j = local.length - 1; i < local.length; j = i++) {
      const [xi, yi] = local[i];
      const [xj, yj] = local[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// Distance in degrees of latitude to the nearest border, with longitude scaled by cos(lat).
function borderDistance(rings: CountryRings, { lat, lon }: LatLon): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let min = Infinity;
  for (const ring of rings) {
    const local = ring.map(([x, y]) => [
      (x - Math.round((x - lon) / 360) * 360 - lon) * k,
      y - lat,
    ]);
    for (let i = 1; i < local.length; i++) {
      const [ax, ay] = local[i - 1];
      const [bx, by] = local[i];
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / len2));
      min = Math.min(min, Math.hypot(ax + t * (bx - ax), ay + t * (by - ay)));
    }
  }
  return min;
}

test.each(COUNTRIES.map((c) => [c.code, c] as const))(
  'countryLabelPoint lands inside the country, at least as far from its borders as the anchor (%s)',
  (_, country) => {
    const rings = outlines.byIsoRings.get(country.isoNum)!;

    const point = countryLabelPoint(rings, country);

    expect(isInside(rings, point)).toBe(true);
    expect(borderDistance(rings, point)).toBeGreaterThanOrEqual(
      borderDistance(rings, country) - 0.05,
    );
  },
);
