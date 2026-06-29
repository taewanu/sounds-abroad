import type { Track } from "@/lib/chart-schema";

// Picks which row gets the one-time commentary pulse: the first track that
// actually carries commentary. Deliberately not a fixed rank — commentary is
// gated per track (published or dropped at authoring time), so the top of the
// list may have none and the set shifts as charts refresh. The tracks array is
// already in rank order. Returns null when no track here has commentary.
export function firstCommentaryRank(tracks: Track[]): number | null {
  return tracks.find((track) => track.commentary)?.rank ?? null;
}
