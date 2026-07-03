import { normalizeForKey } from "./commentary-store";

/**
 * Cross-country identity of a charting track: the Apple song id parsed from
 * the `i=` query param on `appleUrl`, or an artist+name fallback (mirroring
 * `commentaryKey`) when the id can't be parsed out.
 */
export function trackSpreadKey(track: {
  appleUrl: string;
  artist: string;
  name: string;
}): string {
  const songId = appleSongId(track.appleUrl);
  if (songId) return `id:${songId}`;
  return `name:${normalizeForKey(track.artist)}|${normalizeForKey(track.name)}`;
}

function appleSongId(appleUrl: string): string | null {
  try {
    return new URL(appleUrl).searchParams.get("i");
  } catch {
    return null;
  }
}
