import type { ChartTrack } from "./chart-schema";
import { sameTrack } from "./track-identity";

/**
 * The next or previous playable track relative to the current one, or null.
 * Clamps at the ends (no #1<->#last wrap) and skips tracks with no preview, so
 * stepping never lands on a track that can't play. Locates the current track by
 * stable identity: keying on previewUrl would misfire when two rows share a
 * preview asset or when several have none.
 */
export function findAdjacentPlayable(
  tracks: ChartTrack[],
  current: ChartTrack | null,
  dir: 1 | -1,
): ChartTrack | null {
  if (current === null) return null;
  const currentIdx = tracks.findIndex((t) => sameTrack(t, current));
  if (currentIdx === -1) return null;
  for (let i = currentIdx + dir; i >= 0 && i < tracks.length; i += dir) {
    if (tracks[i].previewUrl !== null) return tracks[i];
  }
  return null;
}
