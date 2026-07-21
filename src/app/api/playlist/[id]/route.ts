import * as Sentry from "@sentry/nextjs";

import { MUSIC_CHARTS_TAG } from "@/lib/cache-tags";
import {
  PlaylistFetchError,
  PlaylistValidationError,
  fetchPlaylistFile,
} from "@/lib/playlist-client";

export const runtime = "nodejs";

export const MISCONFIGURED_MESSAGE = "CHARTS_BLOB_URL is not configured";

function json(body: unknown, status: number, cache?: string): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cache) headers["cache-control"] = cache;
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Serves one playlist's track list to the browser.
 *
 * The read goes through here rather than straight from the page because the
 * store answers without a cross-origin header and its location is server-only
 * configuration. Routing it also keeps the charts cache tag on the read, so a
 * crawl revalidation refreshes charts and track lists together instead of
 * leaving one generation behind.
 */
export async function readPlaylist(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return json({ error: "missing playlist id" }, 400);

  const chartsUrl = process.env.CHARTS_BLOB_URL;
  if (!chartsUrl) {
    Sentry.captureMessage(MISCONFIGURED_MESSAGE, "error");
    return json({ error: "not configured" }, 500);
  }

  try {
    const file = await fetchPlaylistFile(chartsUrl, id);
    // Matches the charts payload's own freshness: one crawl writes both, and a
    // revalidation clears them together through the shared tag.
    return json(file, 200, "public, max-age=60");
  } catch (err) {
    // A playlist the latest run never wrote is ordinary, not a defect: a country
    // carried forward on this axis still advertises the charts it had. Anything
    // else is the store failing, which is worth knowing about.
    if (err instanceof PlaylistFetchError && err.status === 404) {
      return json({ error: "no such playlist" }, 404);
    }
    if (
      err instanceof PlaylistFetchError ||
      err instanceof PlaylistValidationError
    ) {
      Sentry.addBreadcrumb({
        category: "playlist",
        level: "warning",
        message: "playlist.upstream_failed",
        data: { playlistId: id, tag: MUSIC_CHARTS_TAG },
      });
      return json({ error: "upstream failed" }, 502);
    }
    throw err;
  }
}

export { readPlaylist as GET };
