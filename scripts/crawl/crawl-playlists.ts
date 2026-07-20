import type {
  Playlist,
  PlaylistFile,
  PlaylistTrack as ChartPlaylistTrack,
} from "../../src/lib/chart-schema";

import type { ApplePlaylist } from "./apple-playlists";
import {
  batchIds,
  ItunesLookupError,
  type LookupResult,
  type LookupTally,
} from "./itunes-lookup";
import type { BatchLookup } from "./lookup-retry";
import { PlaylistPageError, type PlaylistTrack } from "./playlist-page";
import { genreHistogram } from "./playlist-selection";
import { spotifySearchUrl } from "./spotify-resolve";

/**
 * Share of a country's page fetches that may fail before the run stops treating
 * them as ordinary churn. Playlists are deleted and replaced constantly, so a
 * handful of failures is expected; most of them failing together is the
 * undocumented page contract breaking, which ADR-0015 requires be loud.
 */
const CONTRACT_BREAK_SHARE = 0.5;

export interface PlaylistAxisDeps {
  fetchPlaylistPage: (
    playlistId: string,
    appleUrl: string,
  ) => Promise<PlaylistTrack[]>;
  lookupTracks: BatchLookup;
}

export interface CountryPlaylistsResult {
  /** This run's metadata, keyed by playlist id. Ordering is the caller's. */
  byId: Map<string, Playlist>;
  files: PlaylistFile[];
  /**
   * Playlists selected this run whose page did not parse.
   *
   * Every one of these came out of today's feed, so the playlist exists and
   * only the fetch failed. That makes the failure transient by construction,
   * which is what lets the caller republish the previous run's entry instead
   * of dropping the chart for a day.
   */
  failedIds: string[];
  pagesAttempted: number;
  lookups: LookupTally;
}

/**
 * True when a country's page failures look like a broken contract rather than
 * ordinary playlist churn. Called with a country's tallies; the crawl decides
 * what to do with the answer.
 */
export function isContractBroken(
  pagesAttempted: number,
  pageFailures: number,
  share = CONTRACT_BREAK_SHARE,
): boolean {
  if (pagesAttempted === 0) return false;
  return pageFailures / pagesAttempted > share;
}

type ResolvedTrack = Pick<LookupResult, "previewUrl" | "genre">;

/**
 * Resolves a whole country's playlist tracks in one pass.
 *
 * Called once per country rather than once per playlist: a request carries up
 * to LOOKUP_BATCH_MAX ids and one playlist rarely fills half of one. Gathering
 * the country first also collapses the tracks its playlists share, which are
 * asked about once instead of once per playlist that lists them.
 */
async function previewsFor(
  ids: readonly string[],
  cc: string,
  lookupTracks: BatchLookup,
  tally: LookupTally,
): Promise<Map<string, ResolvedTrack>> {
  const resolved = new Map<string, ResolvedTrack>();
  tally.requested += ids.length;

  for (const batch of batchIds(ids)) {
    try {
      for (const [id, result] of await lookupTracks(batch, cc)) {
        resolved.set(id, {
          previewUrl: result.previewUrl,
          genre: result.genre,
        });
      }
    } catch (err) {
      if (!(err instanceof ItunesLookupError)) throw err;
      console.warn(
        `[crawl ${cc}] playlist lookup ${err.kind} for ${batch.length} ids: ${err.message}`,
      );
    }
  }

  tally.resolved += resolved.size;
  return resolved;
}

/**
 * Builds one country's playlist axis: scrapes the selected playlists, resolves
 * their previews and genres, and returns the metadata for the chart selector
 * alongside the per-playlist track files.
 *
 * Selection happens before this runs, because spread needs every storefront's
 * feed and spread is what decides which pages are worth fetching (ADR-0015).
 */
export async function crawlCountryPlaylists(
  cc: string,
  selected: readonly ApplePlaylist[],
  deps: PlaylistAxisDeps,
  now: () => Date,
): Promise<CountryPlaylistsResult> {
  const byId = new Map<string, Playlist>();
  const files: PlaylistFile[] = [];
  const failedIds: string[] = [];
  const lookups: LookupTally = { requested: 0, resolved: 0 };

  const scrapedByPlaylist = new Map<string, PlaylistTrack[]>();
  for (const playlist of selected) {
    try {
      scrapedByPlaylist.set(
        playlist.id,
        await deps.fetchPlaylistPage(playlist.id, playlist.appleUrl),
      );
    } catch (err) {
      if (!(err instanceof PlaylistPageError)) throw err;
      failedIds.push(playlist.id);
      console.warn(
        `[crawl ${cc}] playlist page ${err.kind} for ${playlist.id}: ${err.message}`,
      );
    }
  }

  const ids = new Set<string>();
  for (const scraped of scrapedByPlaylist.values()) {
    for (const track of scraped) ids.add(track.id);
  }
  const resolved = await previewsFor([...ids], cc, deps.lookupTracks, lookups);

  for (const playlist of selected) {
    const scraped = scrapedByPlaylist.get(playlist.id);
    if (!scraped) continue;

    const tracks: ChartPlaylistTrack[] = scraped.map((track) => ({
      rank: track.rank,
      name: track.name,
      artist: track.artist,
      previewUrl: resolved.get(track.id)?.previewUrl ?? null,
      artworkUrl: track.artworkUrl,
      appleUrl: track.appleUrl,
      spotifyUrl: spotifySearchUrl(track.name, track.artist),
    }));

    byId.set(playlist.id, {
      id: playlist.id,
      name: playlist.name,
      appleUrl: playlist.appleUrl,
      artworkUrl: playlist.artworkUrl,
      genres: genreHistogram(
        scraped.map((track) => resolved.get(track.id)?.genre ?? null),
      ),
      trackCount: tracks.length,
    });

    files.push({
      id: playlist.id,
      lastUpdated: now().toISOString(),
      tracks,
    });
  }

  return {
    byId,
    files,
    failedIds,
    pagesAttempted: selected.length,
    lookups,
  };
}

/**
 * Back-fills each playlist's spread onto the metadata the country carries.
 *
 * Leaves an unscored playlist alone rather than clearing it: a carried entry
 * can be absent from every feed this run, and its last known count is better
 * than none.
 */
export function bakePlaylistSpread(
  byCountry: ReadonlyMap<string, Playlist[]>,
  spread: ReadonlyMap<string, number>,
): void {
  for (const playlists of byCountry.values()) {
    for (const playlist of playlists) {
      const count = spread.get(playlist.id);
      if (count !== undefined) playlist.spread = count;
    }
  }
}
