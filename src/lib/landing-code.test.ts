import { describe, expect, test } from "vitest";

import { CHARTS } from "./__fixtures__";
import { emptyCountry } from "./chart-schema";
import { pickLandingCountry, randomCountryCode } from "./landing-code";

const CODES = ["br", "jp", "kr", "us"] as const;

describe("randomCountryCode", () => {
  test("picks the first code when rng is 0", () => {
    const result = randomCountryCode(CODES, () => 0);

    expect(result).toBe("br");
  });

  test("picks the last code when rng is near 1", () => {
    const result = randomCountryCode(CODES, () => 0.9999);

    expect(result).toBe("us");
  });

  test("returns a code from the set with the default rng", () => {
    const result = randomCountryCode(CODES);

    expect(CODES).toContain(result);
  });
});

describe("pickLandingCountry", () => {
  test("never lands on a country whose entry has no tracks", () => {
    const countries = {
      aa: emptyCountry("First without tracks"),
      ...CHARTS.countries,
      zz: emptyCountry("Last without tracks"),
    };

    const landings = new Set<string>();
    for (let r = 0; r < 1; r += 0.001) {
      landings.add(pickLandingCountry(countries, () => r));
    }

    expect(landings).toEqual(new Set(Object.keys(CHARTS.countries)));
  });

  test("lands on some country when no entry has tracks", () => {
    const countries = {
      aa: emptyCountry("First without tracks"),
      zz: emptyCountry("Last without tracks"),
    };

    const landings = new Set<string>();
    for (let r = 0; r < 1; r += 0.25) {
      landings.add(pickLandingCountry(countries, () => r));
    }

    expect(landings).toEqual(new Set(Object.keys(countries)));
  });
});
