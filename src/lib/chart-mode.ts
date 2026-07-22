import type { ChartTrack } from "./chart-schema";
import { sameTrack } from "./track-identity";

/**
 * Which question the songs chart answers. Neither mode is the real chart with
 * the other its filter; each is named for what it shows.
 */
export type ChartMode = "most_played" | "only_here";

/** The mode a chart opens on. */
export const DEFAULT_CHART_MODE: ChartMode = "most_played";

/** The modes in the order they are offered. */
export const CHART_MODES: readonly ChartMode[] = ["most_played", "only_here"];

/** What each mode is called wherever it is offered. */
export const CHART_MODE_LABELS: Record<ChartMode, string> = {
  most_played: "Most played",
  only_here: "Only here",
};

/**
 * Narrows a chart to the tracks no other country's chart carries, keeping the
 * order it was given. Reads the spread the crawl already baked per track, so it
 * costs no fetch of its own; both modes draw on the whole chart, so the caller
 * hands it every row it has, not the eager ones alone.
 */
export function onlyHere(tracks: readonly ChartTrack[]): ChartTrack[] {
  return tracks.filter(isOnlyHere);
}

/**
 * `spread` counts the countries carrying the track. An absent count is excluded
 * rather than assumed exclusive: a chart that was never counted cannot support
 * the claim the mode's name makes.
 */
function isOnlyHere(track: ChartTrack): boolean {
  return track.spread === 1;
}

/**
 * A country's songs chart as one mode presents it. The one place it is
 * assembled, so the list on screen and the list next and prev walk cannot drift.
 */
export function songsChartRows(
  mode: ChartMode,
  eager: readonly ChartTrack[],
  tail: readonly ChartTrack[] | null,
): ChartTrack[] {
  const whole = tail === null ? [...eager] : [...eager, ...tail];
  return mode === "only_here" ? onlyHere(whole) : whole;
}

/**
 * The chart with the playing track put back at its rank, wherever the mode left
 * it out. Stepping from a track the chart does not contain reads as its end,
 * which would roll the listener out of the country on the next tap.
 */
export function withPlaying(
  rows: readonly ChartTrack[],
  playing: ChartTrack | null,
): ChartTrack[] {
  if (playing === null) return [...rows];
  if (rows.some((row) => sameTrack(row, playing))) return [...rows];
  const at = rows.findIndex((row) => row.rank > playing.rank);
  if (at === -1) return [...rows, playing];
  return [...rows.slice(0, at), playing, ...rows.slice(at)];
}
