import type { ChartFile, ChartTrack } from "./chart-schema";
import { sameTrack } from "./track-identity";

// Redraw bound for a roll whose drawn chart can't continue playback (absent
// from the chart file, or every track preview-less). Past it the player
// dead-stops, the pre-roll end-of-chart behavior.
export const MAX_ROLL_ATTEMPTS = 3;

// Where a roll came from, kept at depth exactly one: prev at the rolled-in
// chart's first playable returns here, and a manual country selection or a
// consumed back-roll discards it. `rolledToCode` both locates the return point
// and marks the roll's own landing so it isn't read as a manual selection.
export interface RollRecord {
  originCountryCode: string;
  originTrack: ChartTrack;
  rolledToCode: string;
}

/** The first track that can play, or null when none can. */
export function firstPlayable(tracks: ChartTrack[]): ChartTrack | null {
  for (const track of tracks) {
    if (track.previewUrl !== null) return track;
  }
  return null;
}

export interface RollLanding {
  code: string;
  track: ChartTrack;
}

/**
 * The country a forward roll lands in and the track it starts, or null for a
 * dead stop. `draw` is the fairness draw; each attempt excludes the origin and
 * every candidate that already failed, so a redraw can't repeat a dead chart.
 */
export function planRoll(
  countries: ChartFile["countries"],
  originCountryCode: string,
  draw: (exclude: readonly string[]) => string,
  maxAttempts: number = MAX_ROLL_ATTEMPTS,
): RollLanding | null {
  const exclude = [originCountryCode];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = draw(exclude);
    const country = countries[code];
    const track = country ? firstPlayable(country.tracks) : null;
    if (track) return { code, track };
    exclude.push(code);
  }
  return null;
}

/**
 * The origin a back-roll returns to, or null when prev should keep its clamp:
 * a back-roll is offered only while a record exists and playback sits on the
 * rolled-in chart's first playable, the exact seat a roll lands on.
 */
export function backRollTarget(
  record: RollRecord | null,
  countries: ChartFile["countries"],
  currentTrack: ChartTrack | null,
  currentCountryCode: string | null,
): { countryCode: string; track: ChartTrack } | null {
  if (record === null || currentTrack === null) return null;
  if (currentCountryCode !== record.rolledToCode) return null;
  const rolled = countries[record.rolledToCode];
  const first = rolled ? firstPlayable(rolled.tracks) : null;
  if (first === null || !sameTrack(first, currentTrack)) return null;
  return { countryCode: record.originCountryCode, track: record.originTrack };
}

/**
 * The record after a country selection: kept only when the selection is the
 * roll's own landing, so the roll setting its target doesn't discard the
 * return path but any other selection (manual or a later landing) does.
 */
export function recordAfterSelection(
  record: RollRecord | null,
  selectedCode: string | null,
): RollRecord | null {
  if (record === null) return null;
  return selectedCode === record.rolledToCode ? record : null;
}
