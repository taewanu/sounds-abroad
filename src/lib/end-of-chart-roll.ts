import { songsChartRows, type ChartMode } from "./chart-mode";
import { isPlaylistRef, SONGS_CHART, type ChartRef } from "./chart-ref";
import type { ChartTrack, Country } from "./chart-schema";
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
  originChartRef: ChartRef;
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

/**
 * The track a roll lands playback on in the given mode, or null when the chart
 * offers none.
 *
 * The one definition of a roll's seat, so the forward roll that takes it and the
 * back-roll that asks whether playback still sits there cannot disagree. Two
 * definitions would let a roll land where prev has no return to offer.
 *
 * Assembled the way the sheet lists the chart, so the seat is a row the listener
 * can see. `deeper` is null until that country's rows past the payload have been
 * read: a mode that filters can only answer from what it has, and the rows it
 * has rank above the ones it does not.
 */
export function landingTrack(
  country: Country | undefined,
  mode: ChartMode,
  deeper: readonly ChartTrack[] | null,
): ChartTrack | null {
  if (!country) return null;
  return firstPlayable(songsChartRows(mode, country.tracks, deeper));
}

export interface RollLanding {
  code: string;
  track: ChartTrack;
}

/** What a country offers a roll: its seat, or null when it offers none. */
export type SeatOf = (countryCode: string) => ChartTrack | null;

/**
 * The country a forward roll lands in and the track it starts, or null for a
 * dead stop. `draw` is the fairness draw; each attempt excludes the origin and
 * every candidate that already failed, so a redraw can't repeat a dead chart.
 *
 * Takes the seat lookup rather than the charts and the mode, so which rows a
 * seat is read from stays the caller's business and this reads as the draw loop
 * it is.
 */
export function planRoll(
  originCountryCode: string,
  seatOf: SeatOf,
  draw: (exclude: readonly string[]) => string,
  maxAttempts: number = MAX_ROLL_ATTEMPTS,
): RollLanding | null {
  const exclude = [originCountryCode];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = draw(exclude);
    const track = seatOf(code);
    if (track) return { code, track };
    exclude.push(code);
  }
  return null;
}

/**
 * The country's playlist charts standing after the given one, in published
 * order. Empty for the songs chart, whose end rolls straight out of the
 * country, and for a ref the country no longer advertises.
 */
export function playlistsAfter(
  country: Country | undefined,
  ref: ChartRef,
): ChartRef[] {
  if (!country || !isPlaylistRef(ref)) return [];
  const playlists = country.playlists ?? [];
  const at = playlists.findIndex((playlist) => playlist.id === ref);
  if (at === -1) return [];
  return playlists.slice(at + 1).map((playlist) => playlist.id);
}

export interface ChartLanding {
  ref: ChartRef;
  track: ChartTrack;
}

/**
 * The chart within the country that continues playback and the track it starts,
 * or null when none of them can. Candidates are tried in order, so the country
 * is exhausted before the caller reaches for a cross-country roll; one that
 * cannot be read or has nothing playable is passed over rather than dead-ending.
 */
export async function planChartContinuation(
  refs: readonly ChartRef[],
  read: (ref: ChartRef) => Promise<ChartTrack[]>,
): Promise<ChartLanding | null> {
  for (const ref of refs) {
    let track: ChartTrack | null = null;
    try {
      track = firstPlayable(await read(ref));
    } catch {
      continue;
    }
    if (track) return { ref, track };
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
  currentTrack: ChartTrack | null,
  currentCountryCode: string | null,
  currentChartRef: ChartRef | null,
  seatOf: SeatOf,
): { countryCode: string; chartRef: ChartRef; track: ChartTrack } | null {
  if (record === null || currentTrack === null) return null;
  if (currentCountryCode !== record.rolledToCode) return null;
  // A roll lands on the songs chart, so playback that has since moved to
  // another of the country's charts is past the seat the return path was
  // offered from, even where the two charts share a track.
  if (currentChartRef !== SONGS_CHART) return null;
  const seat = seatOf(record.rolledToCode);
  if (seat === null || !sameTrack(seat, currentTrack)) return null;
  return {
    countryCode: record.originCountryCode,
    chartRef: record.originChartRef,
    track: record.originTrack,
  };
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
