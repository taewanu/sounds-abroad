import type { ChartFile, Country, Track } from "../../src/lib/chart-schema";
import type { CountryEntry } from "../../src/lib/countries";

import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import { ItunesLookupError, type LookupResult } from "./itunes-lookup";
import type { Throttle } from "./throttle";

export interface CrawlCountryDeps {
  cc: string;
  name: string;
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTrack: (id: string, cc: string) => Promise<LookupResult>;
  throttle: Throttle;
}

export interface CrawlCountryResult {
  cc: string;
  country: Country;
}

export interface CrawlAllDeps {
  countries: readonly CountryEntry[];
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTrack: (id: string, cc: string) => Promise<LookupResult>;
  throttle: Throttle;
  uploadCharts: (chartFile: ChartFile) => Promise<string>;
  triggerRevalidate: () => Promise<void>;
  // Source for carrying forward a country that fails this run. Must resolve
  // null (never reject) when unavailable, which skips carry-forward.
  fetchPrevious?: () => Promise<ChartFile | null>;
  now?: () => Date;
}

export interface CrawlAllResult {
  url: string;
  chartFile: ChartFile;
}

export interface ValiditySummary {
  total: number;
  validCount: number;
  invalidCodes: string[];
}

export function summarizeValidity(chartFile: ChartFile): ValiditySummary {
  const entries = Object.entries(chartFile.countries);
  const invalidCodes = entries.filter(([, c]) => !c.valid).map(([cc]) => cc);
  return {
    total: entries.length,
    validCount: entries.length - invalidCodes.length,
    invalidCodes,
  };
}

function spotifySearchUrl(name: string, artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${name} ${artist}`)}`;
}

export async function crawlCountry(
  deps: CrawlCountryDeps,
): Promise<CrawlCountryResult> {
  const { cc, name, fetchRss, lookupTrack, throttle } = deps;

  let rssTracks: AppleRssTrack[];
  try {
    rssTracks = await throttle(() => fetchRss(cc));
  } catch (err) {
    if (!(err instanceof AppleRssError)) throw err;
    console.warn(`[crawl ${cc}] RSS failed: ${err.message}`);
    return { cc, country: { name, valid: false, tracks: [] } };
  }

  const tracks: Track[] = [];
  for (const rss of rssTracks) {
    let previewUrl: string | null;
    try {
      const lookup = await throttle(() => lookupTrack(rss.id, cc));
      previewUrl = lookup.previewUrl;
    } catch (err) {
      if (!(err instanceof ItunesLookupError)) throw err;
      console.warn(
        `[crawl ${cc}] lookup ${err.kind} for rank ${rss.rank} id=${rss.id}: ${err.message}`,
      );
      previewUrl = null;
    }
    tracks.push({
      rank: rss.rank,
      name: rss.name,
      artist: rss.artist,
      previewUrl,
      artworkUrl: rss.artworkUrl,
      appleUrl: rss.appleUrl,
      spotifySearchUrl: spotifySearchUrl(rss.name, rss.artist),
    });
  }

  return { cc, country: { name, valid: true, tracks } };
}

export async function crawlAll(deps: CrawlAllDeps): Promise<CrawlAllResult> {
  const {
    countries,
    fetchRss,
    lookupTrack,
    throttle,
    uploadCharts,
    triggerRevalidate,
  } = deps;
  const now = deps.now ?? (() => new Date());

  console.log(
    `[crawl] starting all-countries crawl (${countries.length} countries)...`,
  );

  const previous = deps.fetchPrevious ? await deps.fetchPrevious() : null;

  const countriesMap: ChartFile["countries"] = {};
  for (const entry of countries) {
    const { cc, country } = await crawlCountry({
      cc: entry.code,
      name: entry.name,
      fetchRss,
      lookupTrack,
      throttle,
    });

    // Carry forward only genuine prior data, never an earlier empty entry.
    const prior = previous?.countries[cc];
    if (!country.valid && prior?.valid && prior.tracks.length > 0) {
      countriesMap[cc] = prior;
      console.log(
        `[crawl ${cc}] crawl failed — carried forward last-good (${prior.tracks.length} tracks)`,
      );
      continue;
    }

    countriesMap[cc] = country;
    console.log(
      `[crawl ${cc}] ${country.tracks.length} tracks (valid=${country.valid})`,
    );
  }

  const chartFile: ChartFile = {
    lastUpdated: now().toISOString(),
    countries: countriesMap,
  };

  const url = await uploadCharts(chartFile);
  console.log(`[crawl] uploaded → ${url}`);
  await triggerRevalidate();

  return { url, chartFile };
}
