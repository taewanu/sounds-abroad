import { z } from "zod";

export interface ApplePlaylist {
  id: string;
  name: string;
  appleUrl: string;
  artworkUrl: string;
}

export class ApplePlaylistsError extends Error {
  constructor(
    public readonly cc: string,
    message: string,
  ) {
    super(message);
    this.name = "ApplePlaylistsError";
  }
}

export interface FetchPlaylistsOptions {
  fetch?: typeof fetch;
}

/** The feed's ceiling. Every music kind caps here; 200 returns HTTP 500. */
const FEED_DEPTH = 100;

const ARTWORK_SIZE = 600;

const PlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
  artworkUrl100: z.url(),
});

const PlaylistsResponseSchema = z.object({
  feed: z.object({
    results: z.array(PlaylistSchema).min(1),
  }),
});

function playlistsUrl(cc: string): string {
  return `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${FEED_DEPTH}/playlists.json`;
}

/**
 * Rewrites the artwork URL to a larger render by replacing the dimensions in its
 * final path segment.
 *
 * Playlist covers do not share the songs feed's single `100x100bb.jpg` template:
 * one storefront returned nine distinct ones (`100x100SC.DN01.jpg`,
 * `100x100SC.FPESS04.jpg`, `100x25cc.jpg`, and more), with `bb` on a small
 * minority. Matching the literal template the way `apple-rss.ts` does would
 * leave most covers at 100px, so only the dimensions are substituted and the
 * template code is carried through untouched.
 */
export function resizeArtwork(url100: string, size = ARTWORK_SIZE): string {
  const cut = url100.lastIndexOf("/");
  if (cut === -1) return url100;

  const prefix = url100.slice(0, cut + 1);
  const segment = url100.slice(cut + 1);
  return prefix + segment.replace(/^\d+x\d+/, `${size}x${size}`);
}

export async function fetchPlaylists(
  cc: string,
  options: FetchPlaylistsOptions = {},
): Promise<ApplePlaylist[]> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = playlistsUrl(cc);

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (err) {
    throw new ApplePlaylistsError(
      cc,
      `Apple playlists fetch failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    throw new ApplePlaylistsError(
      cc,
      `Apple playlists returned ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new ApplePlaylistsError(
      cc,
      `Apple playlists invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const parsed = PlaylistsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApplePlaylistsError(
      cc,
      `Apple playlists shape mismatch: ${parsed.error.message}`,
    );
  }

  return parsed.data.feed.results.map((raw) => ({
    id: raw.id,
    name: raw.name,
    appleUrl: raw.url,
    artworkUrl: resizeArtwork(raw.artworkUrl100),
  }));
}
