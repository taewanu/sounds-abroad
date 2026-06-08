import { describe, expect, test } from "vitest";

import { countryByCode, validateCountryCode } from "./country-code";

describe("validateCountryCode", () => {
  test("returns null for a missing value", () => {
    const result = validateCountryCode(null);

    expect(result).toBeNull();
  });

  test("returns the canonical lowercase code for a known country", () => {
    const result = validateCountryCode("kr");

    expect(result).toBe("kr");
  });

  test("lowercases an uppercase code", () => {
    const result = validateCountryCode("KR");

    expect(result).toBe("kr");
  });

  test("returns null for an unknown code", () => {
    const result = validateCountryCode("zz");

    expect(result).toBeNull();
  });

  test("rejects a code outside a caller-supplied set", () => {
    const result = validateCountryCode("kr", new Set(["us", "br"]));

    expect(result).toBeNull();
  });
});

describe("countryByCode", () => {
  test("returns the entry for a known code", () => {
    const result = countryByCode("kr");

    expect(result?.name).toBe("South Korea");
  });

  test("returns undefined for an unknown code", () => {
    const result = countryByCode("zz");

    expect(result).toBeUndefined();
  });
});
