import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { COUNTRIES } from "./countries";
import { buildCountryOutlines } from "./country-outlines";

const realTopology = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/countries-50m.json"), "utf-8"),
);

test("buildCountryOutlines splits 40-set countries from others by isoNum", () => {
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

test("buildCountryOutlines includes a non-empty geometry for every 40-set country", () => {
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
