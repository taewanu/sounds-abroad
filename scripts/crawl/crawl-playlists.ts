import type {
  Playlist,
  PlaylistFile,
  PlaylistTrack as ChartPlaylistTrack,
} from "../../src/lib/chart-schema";

import type { ApplePlaylist } from "./apple-playlists";
import { batchIds, ItunesLookupError, type LookupTally } from "./itunes-lookup";
import type { BatchLookup } from "./lookup-retry";
import { PlaylistPageError, type PlaylistTrack } from "./playlist-page";
import { genreHistogram, selectLocalPlaylists } from "./playlist-selection";

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
  playlists: Playlist[];
  files: PlaylistFile[];
  /** False when the axis produced nothing usable for this country. */
  valid: boolean;
  pagesAttempted: number;
  pageFailures: number;
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

async function previewsFor(
  ids: readonly string[],
  cc: string,
  lookupTracks: BatchLookup,
  tally: LookupTally,
): Promise<Map<string, { previewUrl: string; genre: string | null }>> {
  const resolved = new Map<
    string,
    { previewUrl: string; genre: string | null }
  >();
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
  const playlists: Playlist[] = [];
  const files: PlaylistFile[] = [];
  const lookups: LookupTally = { requested: 0, resolved: 0 };
  let pageFailures = 0;

  for (const playlist of selected) {
    let scraped: PlaylistTrack[];
    try {
      scraped = await deps.fetchPlaylistPage(playlist.id, playlist.appleUrl);
    } catch (err) {
      if (!(err instanceof PlaylistPageError)) throw err;
      pageFailures += 1;
      console.warn(
        `[crawl ${cc}] playlist page ${err.kind} for ${playlist.id}: ${err.message}`,
      );
      continue;
    }

    const resolved = await previewsFor(
      scraped.map((track) => track.id),
      cc,
      deps.lookupTracks,
      lookups,
    );

    const tracks: ChartPlaylistTrack[] = scraped.map((track) => ({
      rank: track.rank,
      name: track.name,
      artist: track.artist,
      previewUrl: resolved.get(track.id)?.previewUrl ?? null,
      artworkUrl: track.artworkUrl,
      appleUrl: track.appleUrl,
    }));

    playlists.push({
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
    playlists,
    files,
    valid: playlists.length > 0,
    pagesAttempted: selected.length,
    pageFailures,
    lookups,
  };
}

/** Back-fills each playlist's spread onto the metadata the country carries. */
export function bakePlaylistSpread(
  byCountry: ReadonlyMap<string, Playlist[]>,
  spread: ReadonlyMap<string, number>,
): void {
  for (const playlists of byCountry.values()) {
    for (const playlist of playlists) {
      playlist.spread = spread.get(playlist.id);
    }
  }
}

export { selectLocalPlaylists };
