import type { PlaylistGenre } from "../../src/lib/chart-schema";

import type { ApplePlaylist } from "./apple-playlists";

/**
 * Share of storefronts above which a playlist reads as global rather than local.
 *
 * A fraction, not a count, so the threshold survives the country list changing
 * size. Measured over ten storefronts, the globally-repeated tail sat at 60% of
 * them and up while every regional playlist sat at 40% and below; a quarter
 * falls inside that gap with room on both sides.
 */
const GLOBAL_SPREAD_SHARE = 0.25;

/**
 * Playlists kept per country. Bound by the crawl's time budget rather than by
 * editorial judgement: every kept playlist costs a page fetch plus preview
 * resolution for its tracks. Countries carry far more local playlists than this,
 * so the cap, not the spread filter, is what decides the set.
 */
const PLAYLISTS_PER_COUNTRY = 15;

/**
 * Counts the storefronts carrying each playlist.
 *
 * Keyed by id and never by name: a storefront localizes the title while the id
 * holds still, so counting names would read one global playlist as several
 * local ones.
 */
export function countPlaylistSpread(
  feeds: ReadonlyMap<string, readonly ApplePlaylist[]>,
): Map<string, number> {
  const spread = new Map<string, number>();

  for (const playlists of feeds.values()) {
    const idsHere = new Set(playlists.map((playlist) => playlist.id));
    for (const id of idsHere) {
      spread.set(id, (spread.get(id) ?? 0) + 1);
    }
  }

  return spread;
}

export interface SelectPlaylistsOptions {
  globalSpreadShare?: number;
  limit?: number;
}

/**
 * Drops the globally-repeated playlists, then keeps the most-played of what
 * remains. Feed order is chart order, so slicing it keeps the country's own
 * ranking rather than imposing one.
 */
export function selectLocalPlaylists(
  playlists: readonly ApplePlaylist[],
  spread: ReadonlyMap<string, number>,
  storefrontCount: number,
  options: SelectPlaylistsOptions = {},
): ApplePlaylist[] {
  const share = options.globalSpreadShare ?? GLOBAL_SPREAD_SHARE;
  const limit = options.limit ?? PLAYLISTS_PER_COUNTRY;
  const maxSpread = Math.max(1, Math.floor(storefrontCount * share));

  return playlists
    .filter((playlist) => (spread.get(playlist.id) ?? 1) <= maxSpread)
    .slice(0, limit);
}

/**
 * Tallies a playlist's genres from its member tracks, most common first, with
 * ties broken by name so the order is stable across crawls. Tracks whose genre
 * did not resolve are left out rather than counted as an unknown bucket.
 */
export function genreHistogram(
  genres: readonly (string | null)[],
): PlaylistGenre[] {
  const counts = new Map<string, number>();

  for (const genre of genres) {
    if (genre === null) continue;
    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
