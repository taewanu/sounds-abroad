import { SONGS_CHART, isPlaylistRef, type ChartRef } from "./chart-ref";
import type { Country } from "./chart-schema";

export const CHART_PARAM = "chart";

/**
 * The query naming a country and the chart open within it.
 *
 * The songs chart is left out rather than spelled: it is where a country opens,
 * so naming it would put a parameter in the URL of every visit that never
 * touched the rail.
 */
export function chartQuery(countryCode: string, chart: ChartRef): string {
  const params = new URLSearchParams({ cc: countryCode });
  if (isPlaylistRef(chart)) params.set(CHART_PARAM, chart);
  return `?${params}`;
}

/**
 * The chart a URL asks for, or the songs chart when it names none this country
 * carries.
 *
 * A playlist belongs to exactly one country (ADR-0017), so a link carrying
 * another country's chart is as meaningless as one carrying a chart that no
 * longer exists, and both fall back rather than fail.
 */
export function chartFromUrl(raw: string | null, country: Country): ChartRef {
  if (raw === null) return SONGS_CHART;
  return country.playlists?.some((playlist) => playlist.id === raw)
    ? raw
    : SONGS_CHART;
}
