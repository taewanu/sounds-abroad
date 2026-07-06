import type { Track } from "./chart-schema";

export type GemTier =
  | "entirely their own"
  | "a local favorite"
  | "their most local pick today";

export interface GemSelection {
  gem: Track;
  tier: GemTier;
}

// Strongest to weakest, matching selectGem's own tier order below. The single
// source other modules (e.g. the gem card's strength meter) read from, so
// they can't drift out of sync with a tier being added or reordered here.
export const GEM_TIER_STRENGTH: Record<GemTier, number> = {
  "entirely their own": 3,
  "a local favorite": 2,
  "their most local pick today": 1,
};

/**
 * Picks a country's "today's gem" from its baked spread counts (ADR-0013):
 * a spread-1 top track is "entirely their own"; a spread-1 track further
 * down the chart, or a top track with spread 2-3, is "a local favorite";
 * otherwise the lowest-spread, best-ranked track stands in as "their most
 * local pick today", so a homogenized market still returns a gem. Returns
 * null for an empty track list -- a failed crawl with no carried-forward
 * snapshot can leave a country with none (crawlCountry writes
 * `{ valid: false, tracks: [] }`), and that's the caller's "nothing to show"
 * case to render, not this function's to guess at.
 */
export function selectGem(tracks: Track[]): GemSelection | null {
  if (tracks.length === 0) return null;

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
