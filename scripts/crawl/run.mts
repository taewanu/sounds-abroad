import type { ChartFile, Country, Track } from "../../src/lib/chart-schema";
import type { AppleRssTrack } from "./apple-rss.mjs";
import type { LookupResult } from "./itunes-lookup.mjs";
import type { Throttle } from "./throttle.mjs";

export interface CrawlCountryDeps {
  cc: string;
  name: string;
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTrack: (id: string, cc: string) => Promise<LookupResult>;
  throttle: Throttle;
  uploadCharts: (chartFile: ChartFile) => Promise<string>;
  triggerRevalidate: () => Promise<void>;
  now?: () => Date;
}

export interface CrawlCountryResult {
  url: string;
  chartFile: ChartFile;
}

function spotifySearchUrl(name: string, artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${name} ${artist}`)}`;
}

export async function crawlCountry(
  deps: CrawlCountryDeps,
): Promise<CrawlCountryResult> {
  const {
    cc,
    name,
    fetchRss,
    lookupTrack,
    throttle,
    uploadCharts,
    triggerRevalidate,
  } = deps;
  const now = deps.now ?? (() => new Date());

  const rssTracks = await throttle(() => fetchRss(cc));

  const tracks: Track[] = [];
  let failures = 0;
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
      failures += 1;
      const reason = err instanceof Error ? err.message : "unknown";
      console.warn(
        `[crawl ${cc}] lookup failed for rank ${rss.rank} id=${rss.id}: ${reason}`,
      );
    }
  }

  const country: Country = {
    name,
    valid: failures === 0,
    tracks,
  };

  const chartFile: ChartFile = {
    lastUpdated: now().toISOString(),
    countries: { [cc]: country },
  };

  const url = await uploadCharts(chartFile);
  await triggerRevalidate();

  return { url, chartFile };
}
