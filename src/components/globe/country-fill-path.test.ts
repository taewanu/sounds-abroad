import { expect, test } from "vitest";

import type { CountryRings } from "@/lib/country-outlines";

import { fillCountryRings, type RingPathContext } from "./country-fill-path";

// One pixel per degree, so a point at [lon, lat] lands on (lon + 180, 90 - lat).
const WIDTH = 360;
const HEIGHT = 180;

// One outline listed from each side of the antimeridian: unwrapping runs the
// first past the right canvas edge and the second past the left.
const startingWestOfAntimeridian: [number, number][] = [
  [170, 60],
  [179, 62],
  [-179, 64],
  [-170, 66],
  [170, 60],
];
const startingEastOfAntimeridian: [number, number][] = [
  [-170, 66],
  [-179, 64],
  [179, 62],
  [170, 60],
  [-170, 66],
];

type Point = [x: number, y: number];

function recordSubpaths(rings: CountryRings): Point[][] {
  const subpaths: Point[][] = [];
  const ctx: RingPathContext = {
    beginPath: () => {},
    moveTo: (x, y) => subpaths.push([[x, y]]),
    lineTo: (x, y) => subpaths.at(-1)!.push([x, y]),
    closePath: () => subpaths.at(-1)!.push(subpaths.at(-1)![0]),
    fill: () => {},
  };
  fillCountryRings(ctx, rings, WIDTH, HEIGHT);
  return subpaths;
}

test("fillCountryRings draws no segment wider than half the canvas", () => {
  const subpaths = recordSubpaths([startingWestOfAntimeridian]);

  const widths = subpaths.flatMap((points) =>
    points.slice(1).map(([x], i) => Math.abs(x - points[i][0])),
  );
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths)).toBeLessThanOrEqual(WIDTH / 2);
});

test("fillCountryRings draws a ring that crosses the antimeridian inside both canvas edges, whichever side it starts on", () => {
  for (const ring of [startingWestOfAntimeridian, startingEastOfAntimeridian]) {
    const subpaths = recordSubpaths([ring]);

    const onCanvas = subpaths.flat().filter(([x]) => x >= 0 && x <= WIDTH);
    expect(onCanvas).toEqual(
      expect.arrayContaining([
        [expect.closeTo(350), expect.closeTo(30)],
        [expect.closeTo(359), expect.closeTo(28)],
        [expect.closeTo(1), expect.closeTo(26)],
        [expect.closeTo(10), expect.closeTo(24)],
      ]),
    );
  }
});
