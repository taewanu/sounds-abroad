import type {
  ChartFile,
  Country,
  Playlist,
  PlaylistFile,
  Track,
} from "../../src/lib/chart-schema";
import {
  DEFAULT_LANG,
  commentaryForTrack,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import type { CountryEntry } from "../../src/lib/countries";
import { spotifySearchUrl } from "../../src/lib/spotify-search-url";
import { trackKey } from "../../src/lib/track-identity";

import { ApplePlaylistsError, type ApplePlaylist } from "./apple-playlists";
import { AppleRssError, type AppleRssTrack } from "./apple-rss";
import {
  bakePlaylistSpread,
  crawlCountryPlaylists,
  isContractBroken,
  type CountryPlaylistsResult,
} from "./crawl-playlists";
import { batchIds, ItunesLookupError, type LookupTally } from "./itunes-lookup";
import type { BatchLookup } from "./lookup-retry";
import type { PlaylistTrack } from "./playlist-page";
import {
  countPlaylistSpread,
  selectLocalPlaylists,
} from "./playlist-selection";
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
  // its own slot, see createItunesFetchers). The orchestrator never throttles.
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTracks: BatchLookup;
  spotify?: SpotifyResolution;
}

export interface CrawlCountryResult {
  cc: string;
  country: Country;
  lookups: LookupTally;
}

export interface CrawlAllDeps {
  countries: readonly CountryEntry[];
  // Rate-limited and retry-wrapped, as in CrawlCountryDeps.
  fetchRss: (cc: string) => Promise<AppleRssTrack[]>;
  lookupTracks: BatchLookup;
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
  // The playlist axis, wired only where it is configured. Absent, the crawl
  // publishes the songs axis exactly as it did before this axis existed.
  playlistAxis?: PlaylistAxisWiring;
}

export interface PlaylistAxisWiring {
  fetchPlaylists: (cc: string) => Promise<ApplePlaylist[]>;
  fetchPlaylistPage: (
    playlistId: string,
    appleUrl: string,
  ) => Promise<PlaylistTrack[]>;
  uploadPlaylistFile: (file: PlaylistFile) => Promise<unknown>;
}

/**
 * Raised when playlist pages stop parsing across the run as a whole. Individual
 * playlists come and go, so only a run-wide failure rate means the undocumented
 * page contract broke, and ADR-0015 makes noticing that a condition of relying
 * on it at all.
 */
export class PlaylistContractError extends Error {
  constructor(
    public readonly pagesAttempted: number,
    public readonly pageFailures: number,
  ) {
    super(
      `playlist page contract looks broken: ${pageFailures}/${pagesAttempted} pages failed to parse across the run`,
    );
    this.name = "PlaylistContractError";
  }
}

export interface CrawlAllResult {
  url: string;
  chartFile: ChartFile;
  // Every id this run asked about against how many resolved.
  lookups: LookupTally;
  // Countries republished from the previous payload this run. Carried entries
  // keep `valid: true`, so they are invisible to summarizeValidity, which
  // leaves this the only signal that data is going stale.
  carriedCodes: string[];
  // Countries whose playlist axis was republished from the previous payload.
  // Separate from carriedCodes: the two axes go stale independently.
  carriedPlaylistCodes: string[];
  // Countries publishing no playlists at all this run. Distinct from a carry:
  // nothing stale is being served because there is nothing to serve.
  invalidPlaylistCodes: string[];
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

/**
 * Resolves the track's Spotify link-out: the exact `/track/{id}` deeplink when
 * resolution succeeds, else the `/search` URL (#80). Resolution is best-effort:
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
 * Resolves audio previews for a whole chart, one request per batch of ids.
 * Best-effort, mirroring spotifyUrlFor: an ItunesLookupError leaves that
 * batch's tracks without previews rather than aborting the country, and any
 * other error propagates. An id absent from the result simply has no preview.
 */
async function previewUrlsFor(
  ids: readonly string[],
  cc: string,
  lookupTracks: BatchLookup,
): Promise<{ previews: Map<string, string>; lookups: LookupTally }> {
  const previews = new Map<string, string>();

  for (const batch of batchIds(ids)) {
    try {
      const resolved = await lookupTracks(batch, cc);
      for (const [id, result] of resolved) {
        previews.set(id, result.previewUrl);
      }
    } catch (err) {
      if (!(err instanceof ItunesLookupError)) throw err;
      console.warn(
        `[crawl ${cc}] lookup ${err.kind} for ${batch.length} ids: ${err.message}`,
      );
    }
  }

  return {
    previews,
    lookups: { requested: ids.length, resolved: previews.size },
  };
}

export async function crawlCountry(
  deps: CrawlCountryDeps,
): Promise<CrawlCountryResult> {
  const { cc, name, fetchRss, lookupTracks, spotify } = deps;

  let rssTracks: AppleRssTrack[];
  try {
    rssTracks = await fetchRss(cc);
  } catch (err) {
    if (!(err instanceof AppleRssError)) throw err;
    console.warn(`[crawl ${cc}] RSS failed: ${err.message}`);
    return {
      cc,
      country: { name, valid: false, tracks: [] },
      lookups: { requested: 0, resolved: 0 },
    };
  }

  // Both resolutions start together: they draw on separate throttles, so the
  // Spotify calls run inside the gaps the iTunes batch spends waiting rather
  // than adding their own wall-clock after it.
  const [{ previews, lookups }, spotifyUrls] = await Promise.all([
    previewUrlsFor(
      rssTracks.map((rss) => rss.id),
      cc,
      lookupTracks,
    ),
    Promise.all(
      rssTracks.map((rss) => spotifyUrlFor(rss.name, rss.artist, cc, spotify)),
    ),
  ]);

  const tracks: Track[] = rssTracks.map((rss, index) => ({
    rank: rss.rank,
    name: rss.name,
    artist: rss.artist,
    previewUrl: previews.get(rss.id) ?? null,
    artworkUrl: rss.artworkUrl,
    appleUrl: rss.appleUrl,
    spotifyUrl: spotifyUrls[index],
  }));

  // A successful lookup always carries a preview URL, so zero playable tracks
  // means the lookup failed: a lookup-host outage, not a real chart. Marked
  // invalid so carry-forward keeps the last playable data instead of letting
  // an unplayable chart overwrite it while telemetry reports healthy.
  //
  // Batching made that outcome likelier per country, not rarer. A chart now
  // rides one request instead of twenty-five, so a transport failure surviving
  // its retries takes the whole country rather than a single track. Carry-
  // forward is the right answer to having no previews either way; what changed
  // is how often a country reaches that state.
  const playable = tracks.some((t) => t.previewUrl !== null);
  if (tracks.length > 0 && !playable) {
    console.warn(
      `[crawl ${cc}] all ${tracks.length} lookups failed, zero playable previews`,
    );
  }

  return { cc, country: { name, valid: playable, tracks }, lookups };
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

export interface PlaylistAxisOutcome {
  /** Metadata to publish for this country, or undefined to publish none. */
  playlists?: Playlist[];
  playlistsValid: boolean;
  /** Playlists among those above that came from the previous payload. */
  carriedIds: string[];
}

export interface PlaylistAttempt {
  selected: readonly ApplePlaylist[];
  result: CountryPlaylistsResult;
}

/**
 * Decides what a country publishes on the playlist axis, per playlist rather
 * than per country (ADR-0015).
 *
 * A failed page belongs to a playlist today's feed just listed, so the fetch
 * broke but the playlist did not: republishing yesterday's entry keeps the
 * chart on the shelf instead of blinking it out, and its track blob was never
 * overwritten. Carried entries keep `playlistsValid: true`, mirroring the songs
 * axis, so both degrade by one rule.
 *
 * `attempt` is null when the feed itself failed, the one case with nothing to
 * merge against.
 */
export function resolvePlaylistAxis(
  cc: string,
  attempt: PlaylistAttempt | null,
  prior: Country | undefined,
): PlaylistAxisOutcome {
  const priorPlaylists = prior?.playlistsValid ? (prior.playlists ?? []) : [];

  if (!attempt) {
    if (priorPlaylists.length === 0) {
      console.warn(`[crawl ${cc}] playlist feed failed with no prior data`);
      return { playlistsValid: false, carriedIds: [] };
    }
    console.log(
      `[crawl ${cc}] playlist feed failed, carried forward last-good (${priorPlaylists.length} playlists)`,
    );
    return {
      // Copies: bakePlaylistSpread writes through what it is handed, and these
      // objects still belong to the previous payload the snapshot republishes.
      playlists: priorPlaylists.map((playlist) => ({ ...playlist })),
      playlistsValid: true,
      carriedIds: priorPlaylists.map((playlist) => playlist.id),
    };
  }

  const priorById = new Map(priorPlaylists.map((p) => [p.id, p]));
  const playlists: Playlist[] = [];
  const carriedIds: string[] = [];

  // Walk the selection, not the results: feed order is chart order, and a
  // carried entry has to land in the same place it held yesterday.
  for (const selected of attempt.selected) {
    const fresh = attempt.result.byId.get(selected.id);
    if (fresh) {
      playlists.push(fresh);
      continue;
    }
    const stale = priorById.get(selected.id);
    if (stale) {
      playlists.push({ ...stale });
      carriedIds.push(selected.id);
    }
  }

  if (playlists.length === 0) {
    console.warn(`[crawl ${cc}] playlist axis produced nothing publishable`);
    return { playlistsValid: false, carriedIds: [] };
  }

  if (carriedIds.length > 0) {
    console.log(
      `[crawl ${cc}] carried forward ${carriedIds.length} playlist(s) whose page failed`,
    );
  }

  return { playlists, playlistsValid: true, carriedIds };
}

export async function crawlAll(deps: CrawlAllDeps): Promise<CrawlAllResult> {
  const {
    countries,
    fetchRss,
    lookupTracks,
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
  const lookups: LookupTally = { requested: 0, resolved: 0 };
  // Phase 1 of the playlist axis: every storefront's feed, because spread needs
  // all of them before it can say which playlists are worth a page fetch.
  const feeds = new Map<string, ApplePlaylist[]>();
  for (const entry of countries) {
    if (deps.playlistAxis) {
      try {
        feeds.set(
          entry.code,
          await deps.playlistAxis.fetchPlaylists(entry.code),
        );
      } catch (err) {
        if (!(err instanceof ApplePlaylistsError)) throw err;
        console.warn(
          `[crawl ${entry.code}] playlist feed failed: ${err.message}`,
        );
      }
    }

    const {
      cc,
      country,
      lookups: countryLookups,
    } = await crawlCountry({
      cc: entry.code,
      name: entry.name,
      fetchRss,
      lookupTracks,
      spotify,
    });
    lookups.requested += countryLookups.requested;
    lookups.resolved += countryLookups.resolved;

    // Carry forward only genuine prior data, never an earlier empty entry.
    const prior = previous?.countries[cc];
    if (!country.valid && prior?.valid && prior.tracks.length > 0) {
      countriesMap[cc] = prior;
      carriedCodes.push(cc);
      console.log(
        `[crawl ${cc}] crawl failed, carried forward last-good (${prior.tracks.length} tracks)`,
      );
      continue;
    }

    countriesMap[cc] = country;
    console.log(
      `[crawl ${cc}] ${country.tracks.length} tracks (valid=${country.valid})`,
    );
  }

  bakeSpread(countriesMap);

  const playlistAxisRun = deps.playlistAxis
    ? await crawlPlaylistAxis({
        axis: deps.playlistAxis,
        countries,
        countriesMap,
        feeds,
        previous,
        lookupTracks,
        lookups,
        now,
      })
    : { carried: [], invalid: [], contractBreak: null };
  const { carried: carriedPlaylistCodes, invalid: invalidPlaylistCodes } =
    playlistAxisRun;

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
  console.log(
    `[crawl] lookups: ${lookups.resolved}/${lookups.requested} ids resolved`,
  );
  await triggerRevalidate();

  // Strictly after publishing. A broken page contract has to fail the run
  // loudly, but failing it before the upload would keep today's songs charts
  // off the site to signal a fault on the secondary axis, which is the trade
  // ADR-0015 exists to refuse.
  if (playlistAxisRun.contractBreak) {
    throw new PlaylistContractError(
      playlistAxisRun.contractBreak.pagesAttempted,
      playlistAxisRun.contractBreak.pageFailures,
    );
  }

  return {
    url,
    chartFile,
    lookups,
    carriedCodes,
    carriedPlaylistCodes,
    invalidPlaylistCodes,
  };
}

interface PlaylistAxisRun {
  axis: PlaylistAxisWiring;
  countries: readonly CountryEntry[];
  countriesMap: ChartFile["countries"];
  feeds: ReadonlyMap<string, ApplePlaylist[]>;
  previous: ChartFile | null;
  lookupTracks: BatchLookup;
  lookups: LookupTally;
  now: () => Date;
}

/**
 * Phases 2 and 3 of the playlist axis: score every feed against the others,
 * then fetch pages only for what survives. Attaches the metadata each country
 * publishes and uploads the track files, returning the countries whose axis
 * came from the previous payload.
 */
interface PlaylistAxisReport {
  carried: string[];
  invalid: string[];
  contractBreak: { pagesAttempted: number; pageFailures: number } | null;
}

async function crawlPlaylistAxis(
  run: PlaylistAxisRun,
): Promise<PlaylistAxisReport> {
  const { axis, countries, countriesMap, feeds, previous, now } = run;

  const spread = countPlaylistSpread(feeds);
  const carried: string[] = [];
  const invalid: string[] = [];
  const publishedByCountry = new Map<string, Playlist[]>();
  let pagesAttempted = 0;
  let pageFailures = 0;

  for (const entry of countries) {
    const cc = entry.code;
    const feed = feeds.get(cc);

    let attempt: PlaylistAttempt | null = null;
    if (feed) {
      const selected = selectLocalPlaylists(feed, spread, countries.length);
      const result = await crawlCountryPlaylists(
        cc,
        selected,
        {
          fetchPlaylistPage: axis.fetchPlaylistPage,
          lookupTracks: run.lookupTracks,
        },
        now,
      );
      attempt = { selected, result };
      pagesAttempted += result.pagesAttempted;
      pageFailures += result.failedIds.length;
      run.lookups.requested += result.lookups.requested;
      run.lookups.resolved += result.lookups.resolved;
    }

    const outcome = resolvePlaylistAxis(cc, attempt, previous?.countries[cc]);
    if (outcome.carriedIds.length > 0) carried.push(cc);
    if (!outcome.playlistsValid) invalid.push(cc);

    // Copy before attaching: a country carried forward on the songs axis is the
    // previous payload's own object, and writing through it would edit the
    // snapshot the movement diff still reads.
    const country = { ...countriesMap[cc] };
    country.playlistsValid = outcome.playlistsValid;
    if (outcome.playlists) {
      country.playlists = outcome.playlists;
      publishedByCountry.set(cc, outcome.playlists);
    }
    countriesMap[cc] = country;

    // Ahead of charts.json, so a failed upload aborts the run rather than
    // advertising a chart whose track list never arrived.
    if (attempt) {
      for (const file of attempt.result.files) {
        await axis.uploadPlaylistFile(file);
      }
    }
  }

  bakePlaylistSpread(publishedByCountry, spread);

  console.log(
    `[crawl] playlist axis: ${pagesAttempted - pageFailures}/${pagesAttempted} pages parsed, ${carried.length} countries carried, ${invalid.length} empty`,
  );

  return {
    carried,
    invalid,
    contractBreak: isContractBroken(pagesAttempted, pageFailures)
      ? { pagesAttempted, pageFailures }
      : null,
  };
}
