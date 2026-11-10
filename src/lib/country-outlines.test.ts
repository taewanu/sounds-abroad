import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { COUNTRIES } from "./countries";
import { buildCountryOutlines, unwrapLongitudes } from "./country-outlines";

const realTopology = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/countries-50m.json"), "utf-8"),
);

test("buildCountryOutlines splits chart-set countries from others by isoNum", () => {
  const outlines = buildCountryOutlines(realTopology);

  expect(outlines.byIso.has(410)).toBe(true);
  expect(outlines.byIso.has(716)).toBe(false);
  expect(outlines.tier1Positions.length).toBeGreaterThan(0);
  expect(outlines.tier2Positions.length).toBeGreaterThan(0);
});

test("buildCountryOutlines emits line-segment pairs (each segment = 6 floats)", () => {
  const outlines = buildCountryOutlines(realTopology);
  const kr = outlines.byIso.get(410);

  expect(kr).toBeDefined();
  expect(kr!.length).toBeGreaterThan(0);
  expect(kr!.length % 6).toBe(0);
  expect(outlines.tier1Positions.length % 6).toBe(0);
  expect(outlines.tier2Positions.length % 6).toBe(0);
});

test("buildCountryOutlines includes a non-empty geometry for every chart-set country", () => {
  const outlines = buildCountryOutlines(realTopology);

  for (const country of COUNTRIES) {
    const positions = outlines.byIso.get(country.isoNum);
    expect(
      positions,
      `missing geometry for ${country.code} (isoNum=${country.isoNum})`,
    ).toBeDefined();
    expect(
      positions!.length,
      `empty geometry for ${country.code} (isoNum=${country.isoNum})`,
    ).toBeGreaterThan(0);
  }
});

test("buildCountryOutlines exposes lat/lon rings for every chart-set country", () => {
  const outlines = buildCountryOutlines(realTopology);

  for (const country of COUNTRIES) {
    const rings = outlines.byIsoRings.get(country.isoNum);
    expect(
      rings,
      `missing rings for ${country.code} (isoNum=${country.isoNum})`,
    ).toBeDefined();
    expect(
      rings!.length,
      `empty rings for ${country.code} (isoNum=${country.isoNum})`,
    ).toBeGreaterThan(0);
  }
});

test("buildCountryOutlines merges features sharing an ISO num (AU 036: Australia + Ashmore)", () => {
  const outlines = buildCountryOutlines(realTopology);
  const auRings = outlines.byIsoRings.get(36);

  expect(auRings).toBeDefined();

  const includesMainland = auRings!.some((ring) => {
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return minLon <= 135 && 135 <= maxLon && minLat <= -25 && -25 <= maxLat;
  });

  expect(includesMainland).toBe(true);
});

test("unwrapLongitudes leaves no step wider than 180° in any chart-set ring", () => {
  const outlines = buildCountryOutlines(realTopology);

  for (const [isoNum, rings] of outlines.byIsoRings) {
    for (const ring of rings) {
      const unwrapped = unwrapLongitudes(ring);
      for (let i = 1; i < unwrapped.length; i++) {
        const step = Math.abs(unwrapped[i][0] - unwrapped[i - 1][0]);

        expect(step, `isoNum ${isoNum}`).toBeLessThanOrEqual(180);
      }
    }
  }
});

test("unwrapLongitudes keeps each point on its original meridian", () => {
  const ring: [number, number][] = [
    [170, 60],
    [179.5, 62],
    [-179.5, 64],
    [-170, 66],
    [170, 60],
  ];

  const unwrapped = unwrapLongitudes(ring);

  expect(unwrapped).toHaveLength(ring.length);
  unwrapped.forEach(([lon, lat], i) => {
    expect((((lon - ring[i][0]) % 360) + 360) % 360).toBe(0);
    expect(lat).toBe(ring[i][1]);
  });
});

test("buildCountryOutlines rings entries are [lon, lat] pairs within valid ranges", () => {
  const outlines = buildCountryOutlines(realTopology);
  const kr = outlines.byIsoRings.get(410);

  expect(kr).toBeDefined();
  for (const ring of kr!) {
    for (const point of ring) {
      const [lon, lat] = point;

      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  }
});
