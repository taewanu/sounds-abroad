import type { ChartFile } from "./chart-schema";
import { codesWithTracks } from "./fairness-draw";

export function randomCountryCode(
  codes: readonly string[],
  rng: () => number = Math.random,
): string {
  return codes[Math.floor(rng() * codes.length)];
}

// The country a bare home arrival lands on: one whose entry has tracks, so the
// landing has a chart to show. When no entry has any, every country is as good
// as another and the landing falls back to all of them.
export function pickLandingCountry(
  countries: ChartFile["countries"],
  rng: () => number = Math.random,
): string {
  const withTracks = codesWithTracks(countries);
  return randomCountryCode(
    withTracks.length > 0 ? withTracks : Object.keys(countries),
    rng,
  );
}
