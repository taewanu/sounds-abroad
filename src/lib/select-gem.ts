import type { Track } from "./chart-schema";

export type GemTier =
  | "entirely their own"
  | "a local favorite"
  | "their most local pick today";

export interface GemSelection {
  gem: Track;
  tier: GemTier;
}

/**
 * Picks a country's "today's gem" from its baked spread counts (ADR-0013):
 * a spread-1 top track is "entirely their own"; a spread-1 track further
 * down the chart, or a top track with spread 2-3, is "a local favorite";
 * otherwise the lowest-spread, best-ranked track stands in as "their most
 * local pick today", so a homogenized market still returns a gem. Assumes a
 * non-empty track list, true for any crawled country.
 */
export function selectGem(tracks: Track[]): GemSelection {
  const topTrack = bestRanked(tracks);

  if (topTrack.spread === 1) {
    return { gem: topTrack, tier: "entirely their own" };
  }

  const uniqueTracks = tracks.filter((track) => track.spread === 1);
  if (uniqueTracks.length > 0) {
    return { gem: bestRanked(uniqueTracks), tier: "a local favorite" };
  }

  if (topTrack.spread === 2 || topTrack.spread === 3) {
    return { gem: topTrack, tier: "a local favorite" };
  }

  return { gem: lowestSpread(tracks), tier: "their most local pick today" };
}

function bestRanked(tracks: Track[]): Track {
  return tracks.reduce((best, track) =>
    track.rank < best.rank ? track : best,
  );
}

function lowestSpread(tracks: Track[]): Track {
  return tracks.reduce((lowest, track) => {
    const trackSpread = track.spread ?? Infinity;
    const lowestSpread = lowest.spread ?? Infinity;
    if (trackSpread !== lowestSpread)
      return trackSpread < lowestSpread ? track : lowest;
    return track.rank < lowest.rank ? track : lowest;
  });
}
