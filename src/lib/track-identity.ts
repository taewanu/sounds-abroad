import { normalizeForKey } from "./commentary-store";

/** The track fields that establish identity, so callers can pass a partial. */
type TrackIdentity = { appleUrl: string; artist: string; name: string };

/**
 * The stable identity of a charting track, independent of which country's chart
 * it appears on: the Apple song id parsed from the `i=` query param on
 * `appleUrl`, or an artist+name fallback (mirroring `commentaryKey`) when the id
 * can't be parsed out. `previewUrl` is unfit for identity: it is nullable (two
 * preview-less tracks would collide) and Apple can serve one preview asset to a
 * song across storefronts, so keying on it lets one song's playback state leak
 * between countries.
 */
export function trackKey(track: TrackIdentity): string {
  const songId = appleSongId(track.appleUrl);
  if (songId) return `id:${songId}`;
  return `name:${normalizeForKey(track.artist)}|${normalizeForKey(track.name)}`;
}

/** Whether two tracks are the same song. Null on either side is never a match. */
export function sameTrack(
  a: TrackIdentity | null,
  b: TrackIdentity | null,
): boolean {
  if (a === null || b === null) return false;
  return trackKey(a) === trackKey(b);
}

function appleSongId(appleUrl: string): string | null {
  try {
    return new URL(appleUrl).searchParams.get("i");
  } catch {
    return null;
  }
}
