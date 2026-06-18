import { describe, expect, test } from "vitest";

import type { Claim } from "./chart-schema";
import { classifyGate, type GateChecks } from "./gate-classifier";

const ALL_PASS: GateChecks = {
  noLyric: true,
  sourceAuthority: true,
  tierConsistency: true,
  grounding: true,
};

const TIERS: Claim[] = ["what-it-is", "why-charting"];
const CHECKS = [
  "noLyric",
  "sourceAuthority",
  "tierConsistency",
  "grounding",
] as const;

describe("classifyGate", () => {
  test.each(TIERS)("publishes a %s blurb that clears every check", (tier) => {
    expect(classifyGate(tier, ALL_PASS)).toBe("publish");
  });

  test.each(TIERS.flatMap((tier) => CHECKS.map((check) => ({ tier, check }))))(
    "drops a $tier blurb when $check fails",
    ({ tier, check }) => {
      expect(classifyGate(tier, { ...ALL_PASS, [check]: false })).toBe("drop");
    },
  );

  test("drops when several checks fail at once", () => {
    expect(
      classifyGate("why-charting", {
        ...ALL_PASS,
        sourceAuthority: false,
        grounding: false,
      }),
    ).toBe("drop");
  });
});
