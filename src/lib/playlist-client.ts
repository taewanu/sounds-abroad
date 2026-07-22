import { MUSIC_CHARTS_TAG } from "./cache-tags";
import { PlaylistFileSchema, type PlaylistFile } from "./chart-schema";

/**
 * How long the server waits on the store. Without a bound a hung connection
 * never settles, and a chart waiting on one keeps telling the listener it is
 * loading with no way to fail. Generous against a blob of this size, so a slow
 * network still lands.
 */
const READ_TIMEOUT_MS = 10_000;

export class PlaylistFetchError extends Error {
  constructor(
    public readonly playlistId: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlaylistFetchError";
  }
}

export class PlaylistValidationError extends Error {
  constructor(
    public readonly playlistId: string,
    public readonly issues: unknown,
    message: string,
  ) {
    super(message);
    this.name = "PlaylistValidationError";
  }
}

/**
 * Locates a playlist's track list from the charts URL, since both are published
 * by the same crawl into the same blob store and only the charts URL is
 * configured. Swaps the final segment rather than reassembling the path, so a
 * change of host or prefix carries through untouched.
 */
export function playlistFileUrl(chartsUrl: string, playlistId: string): string {
  const cut = chartsUrl.lastIndexOf("/");
  if (cut === -1) {
    throw new PlaylistFetchError(
      playlistId,
      0,
      `Cannot derive a playlist URL from "${chartsUrl}"`,
    );
  }
  return `${chartsUrl.slice(0, cut)}/playlists/${encodeURIComponent(playlistId)}.json`;
}

/**
 * Reads one playlist's track list.
 *
 * Shares the charts cache tag: a crawl publishes both in the same run, so a
 * revalidation that refreshes the charts must not leave the track lists behind
 * pointing at the previous generation.
 *
 * A missing blob is an ordinary outcome here, not a bug. The chart selector
 * renders from metadata that a carried-forward country may have republished
 * ahead of a blob this run never wrote, so callers must handle the failure
 * rather than assume every advertised chart loads.
 */
export async function fetchPlaylistFile(
  chartsUrl: string,
  playlistId: string,
): Promise<PlaylistFile> {
  const url = playlistFileUrl(chartsUrl, playlistId);

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "force-cache",
      next: { tags: [MUSIC_CHARTS_TAG] },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (err) {
    throw new PlaylistFetchError(
      playlistId,
      0,
      `Playlist fetch failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    throw new PlaylistFetchError(
      playlistId,
      res.status,
      `Playlist fetch failed: ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new PlaylistFetchError(
      playlistId,
      res.status,
      `Playlist fetch failed: invalid JSON (${err instanceof Error ? err.message : "parse error"})`,
    );
  }

  const parsed = PlaylistFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new PlaylistValidationError(
      playlistId,
      parsed.error.issues,
      "Playlist payload failed schema validation",
    );
  }

  if (parsed.data.id !== playlistId) {
    throw new PlaylistValidationError(
      playlistId,
      { id: parsed.data.id },
      `Playlist payload is for ${parsed.data.id}, not ${playlistId}`,
    );
  }

  return parsed.data;
}
