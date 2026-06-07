import { describe, expect, test } from "vitest";

import { randomCountryCode } from "./landing-code";

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
