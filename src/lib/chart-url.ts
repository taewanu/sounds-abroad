import { CHART_MODES, DEFAULT_CHART_MODE, type ChartMode } from "./chart-mode";
import { SONGS_CHART, isPlaylistRef, type ChartRef } from "./chart-ref";
import type { Country } from "./chart-schema";

export const CHART_PARAM = "chart";
export const MODE_PARAM = "mode";

/** The static per-country page for a country code. */
export function countryPath(countryCode: string): string {
  return `/c/${countryCode}`;
}

/**
 * The path naming a country, the chart open within it, and the mode it reads in.
 *
 * The songs chart and the default mode are left out rather than spelled: they
 * are where a country opens, so naming them would put a parameter in the URL of
 * every visit that never touched the rail. The mode rides even while a playlist
 * is open, where it shows nothing, so returning to the songs chart still reads
 * in the mode the listener last asked for.
 */
export function chartPath(
  countryCode: string,
  chart: ChartRef,
  mode: ChartMode = DEFAULT_CHART_MODE,
): string {
  const base = countryPath(countryCode);
  const params = new URLSearchParams();
  if (isPlaylistRef(chart)) params.set(CHART_PARAM, chart);
  if (mode !== DEFAULT_CHART_MODE) params.set(MODE_PARAM, mode);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** The country code a `/c/` path names, or null for any other path. */
export function countryCodeFromPath(pathname: string): string | null {
  const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
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

/**
 * The mode a URL asks for, or the default when it names none or names one no
 * mode answers to. An unrecognised value falls back rather than fails, the same
 * contract chartFromUrl holds for a chart this country does not carry.
 */
export function modeFromUrl(raw: string | null): ChartMode {
  if (raw === null) return DEFAULT_CHART_MODE;
  return CHART_MODES.includes(raw as ChartMode)
    ? (raw as ChartMode)
    : DEFAULT_CHART_MODE;
}
