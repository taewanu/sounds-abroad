/**
 * The link-out used when no exact track id is available: a Spotify search for
 * the name and artist. Synthesized locally, so unlike `/track/{id}` it costs no
 * API call and is always available.
 *
 * Lives here rather than beside the crawl because both sides need it: the crawl
 * bakes it as a fallback, and the reader synthesizes it for a payload written
 * before the field existed.
 */
export function spotifySearchUrl(name: string, artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${name} ${artist}`)}`;
}
