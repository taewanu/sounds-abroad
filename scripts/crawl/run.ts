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
  now?: () => Date;
}

export interface CrawlAllResult {
  url: string;
  chartFile: ChartFile;
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
    try {
      const lookup = await throttle(() => lookupTrack(rss.id, cc));
      tracks.push({
        rank: rss.rank,
        name: rss.name,
        artist: rss.artist,
        previewUrl: lookup.previewUrl,
        artworkUrl: rss.artworkUrl,
        appleUrl: rss.appleUrl,
        spotifySearchUrl: spotifySearchUrl(rss.name, rss.artist),
      });
    } catch (err) {
      if (!(err instanceof ItunesLookupError)) throw err;
      console.warn(
        `[crawl ${cc}] lookup failed for rank ${rss.rank} id=${rss.id}: ${err.message}`,
      );
    }
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

  const countriesMap: ChartFile["countries"] = {};
  for (const entry of countries) {
    const { cc, country } = await crawlCountry({
      cc: entry.code,
      name: entry.name,
      fetchRss,
      lookupTrack,
      throttle,
    });
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
