import type { ChartFile, Country, Track } from "../../src/lib/chart-schema";
import {
  DEFAULT_LANG,
  commentaryForTrack,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import type { CountryEntry } from "../../src/lib/countries";
import { trackKey } from "../../src/lib/track-identity";

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
  // Both iTunes fetchers arrive rate-limited and retry-wrapped (they share one
  // throttle, and the retry must sit around the throttle so each attempt takes
  // its own slot — see createItunesFetchers). The orchestrator never throttles.
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTrack: (id: string, cc: string) => Promise<LookupResult>;
  spotify?: SpotifyResolution;
}

export interface CrawlCountryResult {
  cc: string;
  country: Country;
}

export interface CrawlAllDeps {
  countries: readonly CountryEntry[];
  // Rate-limited and retry-wrapped, as in CrawlCountryDeps.
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTrack: (id: string, cc: string) => Promise<LookupResult>;
  spotify?: SpotifyResolution;
  uploadCharts: (chartFile: ChartFile) => Promise<string>;
  triggerRevalidate: () => Promise<void>;
  // Source for carrying forward a country that fails this run. Must resolve
  // null (never reject) when unavailable, which skips carry-forward.
  fetchPrevious?: () => Promise<ChartFile | null>;
  // Snapshots the outgoing charts before uploadCharts overwrites them in
  // place; the worklist's rank-movement triggers diff against it. Like
  // fetchPrevious, must resolve (never reject): losing one snapshot
  // generation is cheaper than aborting a finished crawl.
  uploadPrevious?: (chartFile: ChartFile) => Promise<unknown>;
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
  // Countries republished from the previous payload this run. Carried entries
  // keep `valid: true`, so they are invisible to summarizeValidity — this is
  // the only signal that data is going stale.
  carriedCodes: string[];
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

/**
 * Resolves the track's audio preview: the iTunes `previewUrl` when the lookup
 * succeeds, else null. Best-effort, mirroring spotifyUrlFor — any
 * ItunesLookupError degrades to a null preview so one bad track never aborts
 * the crawl; any other error propagates.
 */
async function previewUrlFor(
  id: string,
  rank: number,
  cc: string,
  lookupTrack: CrawlCountryDeps["lookupTrack"],
): Promise<string | null> {
  try {
    const lookup = await lookupTrack(id, cc);
    return lookup.previewUrl;
  } catch (err) {
    if (!(err instanceof ItunesLookupError)) throw err;
    console.warn(
      `[crawl ${cc}] lookup ${err.kind} for rank ${rank} id=${id}: ${err.message}`,
    );
    return null;
  }
}

export async function crawlCountry(
  deps: CrawlCountryDeps,
): Promise<CrawlCountryResult> {
  const { cc, name, fetchRss, lookupTrack, spotify } = deps;

  let rssTracks: AppleRssTrack[];
  try {
    rssTracks = await fetchRss(cc);
  } catch (err) {
    if (!(err instanceof AppleRssError)) throw err;
    console.warn(`[crawl ${cc}] RSS failed: ${err.message}`);
    return { cc, country: { name, valid: false, tracks: [] } };
  }

  const tracks: Track[] = [];
  for (const rss of rssTracks) {
    const [previewUrl, spotifyUrl] = await Promise.all([
      previewUrlFor(rss.id, rss.rank, cc, lookupTrack),
      spotifyUrlFor(rss.name, rss.artist, cc, spotify),
    ]);
    tracks.push({
      rank: rss.rank,
      name: rss.name,
      artist: rss.artist,
      previewUrl,
      artworkUrl: rss.artworkUrl,
      appleUrl: rss.appleUrl,
      spotifyUrl,
    });
  }

  // A successful lookup always carries a preview URL, so zero playable tracks
  // means every lookup failed — a lookup-host outage, not a real chart. Marked
  // invalid so carry-forward keeps the last playable data instead of letting
  // an unplayable chart overwrite it while telemetry reports healthy.
  const playable = tracks.some((t) => t.previewUrl !== null);
  if (tracks.length > 0 && !playable) {
    console.warn(
      `[crawl ${cc}] all ${tracks.length} lookups failed — zero playable previews`,
    );
  }

  return { cc, country: { name, valid: playable, tracks } };
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

/**
 * Back-fills each track's spread: how many countries' charts contain a track
 * with the same cross-country key (ADR-0013). Recomputed from scratch every
 * crawl, so a track's spread always reflects this run's charts, including
 * any carried-forward country.
 */
export function bakeSpread(countries: ChartFile["countries"]): void {
  const countryCountByKey = new Map<string, number>();
  for (const country of Object.values(countries)) {
    const keysInCountry = new Set(country.tracks.map(trackKey));
    for (const key of keysInCountry) {
      countryCountByKey.set(key, (countryCountByKey.get(key) ?? 0) + 1);
    }
  }

  for (const country of Object.values(countries)) {
    for (const track of country.tracks) {
      track.spread = countryCountByKey.get(trackKey(track));
    }
  }
}

export async function crawlAll(deps: CrawlAllDeps): Promise<CrawlAllResult> {
  const {
    countries,
    fetchRss,
    lookupTrack,
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
  const carriedCodes: string[] = [];
  for (const entry of countries) {
    const { cc, country } = await crawlCountry({
      cc: entry.code,
      name: entry.name,
      fetchRss,
      lookupTrack,
      spotify,
    });

    // Carry forward only genuine prior data, never an earlier empty entry.
    const prior = previous?.countries[cc];
    if (!country.valid && prior?.valid && prior.tracks.length > 0) {
      countriesMap[cc] = prior;
      carriedCodes.push(cc);
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

  bakeSpread(countriesMap);

  const commentary = deps.fetchCommentary ? await deps.fetchCommentary() : null;
  if (commentary) {
    bakeCommentary(countriesMap, commentary, deps.lang ?? DEFAULT_LANG);
  }

  const chartFile: ChartFile = {
    lastUpdated: now().toISOString(),
    countries: countriesMap,
  };

  // Snapshot strictly before the overwrite: once uploadCharts runs, the
  // outgoing payload is gone and the movement diff loses a generation.
  if (deps.uploadPrevious && previous) {
    await deps.uploadPrevious(previous);
  }

  const url = await uploadCharts(chartFile);
  console.log(`[crawl] uploaded → ${url}`);
  await triggerRevalidate();

  return { url, chartFile, carriedCodes };
}
