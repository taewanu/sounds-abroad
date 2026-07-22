/**
 * Which chart a track list came from. Playback used to be located by country
 * alone, which held only while a country carried one chart; a country now
 * carries a songs chart plus one per playlist, so the country locates where the
 * listener is and this locates what they are hearing.
 *
 * A flat string rather than a tagged object because this value goes into React
 * state, effect dependencies, and the URL: `===` settles it in every one of
 * those without a memo or a serializer. The sentinel cannot collide with a
 * playlist id, which the source namespaces under a `pl.` prefix.
 */
export type ChartRef = string;

export const SONGS_CHART: ChartRef = "songs";

/** Whether a ref names a playlist rather than the songs chart. */
export function isPlaylistRef(ref: ChartRef): boolean {
  return ref !== SONGS_CHART;
}
