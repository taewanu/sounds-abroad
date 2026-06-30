import type { Track } from "./chart-schema";

/**
 * The next or previous playable track relative to the current one, or null.
 * Clamps at the ends (no #1<->#last wrap) and skips tracks with no preview, so
 * stepping never lands on a track that can't play.
 */
export function findAdjacentPlayable(
  tracks: Track[],
  currentPreviewUrl: string | null,
  dir: 1 | -1,
): Track | null {
  const currentIdx = tracks.findIndex(
    (t) => t.previewUrl === currentPreviewUrl,
  );
  if (currentIdx === -1) return null;
  for (let i = currentIdx + dir; i >= 0 && i < tracks.length; i += dir) {
    if (tracks[i].previewUrl !== null) return tracks[i];
  }
  return null;
}
