import type { ChartFile, Country, Track } from "../../src/lib/chart-schema";
import {
  DEFAULT_LANG,
  commentaryForTrack,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import type { CountryEntry } from "../../src/lib/countries";

import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import { ItunesLookupError, type LookupResult } from "./itunes-lookup";
import { SpotifyResolveError, type SpotifyResolver } from "./spotify-resolve";
import type { Throttle } from "./throttle";

// Optional Spotify resolution: present only when crawl credentials are wired.
// Both must travel together (a resolver is useless without its own throttle), so
// they share one optional bundle rather than two independently-optional fields.
export interface SpotifyResolution {
  resolve: SpotifyResolver;
  throttle: Throttle;
}

export interface CrawlCountryDeps {
  cc: string;
  name: string;
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTrack: (id: string, cc: string) => Promise<LookupResult>;
  throttle: Throttle;
  spotify?: SpotifyResolution;
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
  spotify?: SpotifyResolution;
  uploadCharts: (chartFile: ChartFile) => Promise<string>;
  triggerRevalidate: () => Promise<void>;
  // Source for carrying forward a country that fails this run. Must resolve
  // null (never reject) when unavailable, which skips carry-forward.
  fetchPrevious?: () => Promise<ChartFile | null>;
  // Out-of-band commentary baked into the served charts. Like fetchPrevious,
  // must resolve null (never reject) when unavailable, which skips the bake and
  // leaves charts untouched. The crawl only ever reads this store (ADR-0007).
  fetchCommentary?: () => Promise<CommentaryStore | null>;
  // Language whose commentary is baked in (English-first; the store key carries
  // the language so others slot in later).
  lang?: string;
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

/**
 * Resolves the track's Spotify link-out: the exact `/track/{id}` deeplink when
 * resolution succeeds, else the `/search` URL (#80). Resolution is best-effort —
 * any SpotifyResolveError degrades to the search URL, never worse than before.
 */
async function spotifyUrlFor(
  name: string,
  artist: string,
  cc: string,
  spotify: SpotifyResolution | undefined,
): Promise<string> {
  if (!spotify) return spotifySearchUrl(name, artist);
  try {
    return await spotify.throttle(() => spotify.resolve(name, artist));
  } catch (err) {
    if (!(err instanceof SpotifyResolveError)) throw err;
    console.warn(
      `[crawl ${cc}] spotify resolve ${err.kind} for "${name}": ${err.message}`,
    );
    return spotifySearchUrl(name, artist);
  }
}

export async function crawlCountry(
  deps: CrawlCountryDeps,
): Promise<CrawlCountryResult> {
  const { cc, name, fetchRss, lookupTrack, throttle, spotify } = deps;

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
      spotifyUrl: await spotifyUrlFor(rss.name, rss.artist, cc, spotify),
    });
  }

  return { cc, country: { name, valid: true, tracks } };
}

/**
 * Back-fills each track's commentary from the session-owned store. The store is
 * authoritative: a track with no entry is set to null, clearing any stale blurb
 * a carried-forward country brought with it. Never writes the store; pure data.
 */
export function bakeCommentary(
  countries: ChartFile["countries"],
  store: CommentaryStore,
  lang: string,
): void {
  for (const country of Object.values(countries)) {
    for (const track of country.tracks) {
      track.commentary = commentaryForTrack(
        store,
        lang,
        track.artist,
        track.name,
      );
    }
  }
}

export async function crawlAll(deps: CrawlAllDeps): Promise<CrawlAllResult> {
  const {
    countries,
    fetchRss,
    lookupTrack,
    throttle,
    spotify,
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
      spotify,
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

  const commentary = deps.fetchCommentary ? await deps.fetchCommentary() : null;
  if (commentary) {
    bakeCommentary(countriesMap, commentary, deps.lang ?? DEFAULT_LANG);
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
