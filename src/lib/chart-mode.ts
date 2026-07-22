import type { ChartTrack } from "./chart-schema";
import { sameTrack } from "./track-identity";

/**
 * Which question the songs chart answers. One chart with two lenses rather than
 * two charts: the storefront's own order, or that same list narrowed to what no
 * other country carries. Neither is the real chart with the other its filter;
 * each is named for what it shows.
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
 * Whether one track belongs in Only here. `spread` counts the countries whose
 * chart carries the track, and is optional: a playlist track never has one, and
 * a country carried forward from before the count was baked can lack it too. An
 * absent count is not evidence of exclusivity, so it is excluded rather than
 * assumed: the mode claims no other country carries the track, and a chart that
 * was never counted cannot support that claim.
 */
function isOnlyHere(track: ChartTrack): boolean {
  return track.spread === 1;
}

/**
 * A country's songs chart as one mode presents it: the rows that travelled with
 * the payload, the rest once they have been read, narrowed to the mode.
 *
 * The one place the chart is assembled, so the list on screen and the list next
 * and prev walk are the same rows rather than two readings that drift.
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
 * The chart with the playing track in it, wherever the mode left it out.
 *
 * Switching mode mid-song can filter the playing track away, and stepping from a
 * track the chart does not contain reads as the end of it, which would roll the
 * listener out of the country on the next tap. Put back at its own rank, so a
 * step lands on the mode's next row rather than leaving.
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
