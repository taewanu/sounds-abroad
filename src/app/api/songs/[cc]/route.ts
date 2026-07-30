import * as Sentry from "@sentry/nextjs";

import { MUSIC_CHARTS_TAG } from "@/lib/cache-tags";
import {
  ChartPartFetchError,
  ChartPartValidationError,
  fetchSongsTail,
} from "@/lib/chart-parts";

export const runtime = "nodejs";

export const MISCONFIGURED_MESSAGE = "CHARTS_BLOB_URL is not configured";

// One lifetime for every answer the store settles until the next crawl, and
// no storage for server-side failures, whose recovery a cached copy would
// only delay.
const CHART_LIFETIME = "public, max-age=60";
const NEVER_STORE = "no-store";

// The cache directive is required so every response states a chosen policy:
// an omitted argument once left failures uncached by platform default, costing
// an invocation on every repeat of the same absent chart.
function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });
}

/**
 * Serves one country's chart beyond the rows that travel eagerly.
 *
 * The read goes through here rather than straight from the page because the
 * store answers without a cross-origin header and its location is server-only
 * configuration. Routing it also keeps the charts cache tag on the read, so a
 * crawl revalidation refreshes every part together.
 */
export async function readSongsTail(
  _req: Request,
  { params }: { params: Promise<{ cc: string }> },
): Promise<Response> {
  const { cc } = await params;
  // A malformed request stays malformed, so its rejection is as cacheable as
  // a success; a server-side failure can recover at any moment, so storing it
  // would delay the recovery.
  if (!/^[a-z]{2}$/.test(cc)) {
    return json({ error: "not a country code" }, 400, CHART_LIFETIME);
  }

  const chartsUrl = process.env.CHARTS_BLOB_URL;
  if (!chartsUrl) {
    Sentry.captureMessage(MISCONFIGURED_MESSAGE, "error");
    return json({ error: "not configured" }, 500, NEVER_STORE);
  }

  try {
    const file = await fetchSongsTail(chartsUrl, cc);
    // Matches the charts payload's own freshness: one crawl writes both, and a
    // revalidation clears them together through the shared tag.
    return json(file, 200, CHART_LIFETIME);
  } catch (err) {
    // A country whose chart the latest run never published deeper is ordinary,
    // not a defect: a carried-forward country keeps whatever the run before it
    // left. Anything else is the store failing, which is worth knowing about.
    if (err instanceof ChartPartFetchError && err.status === 404) {
      // Absent is as cacheable as present: the next crawl is the only event
      // that can change the answer, so the failure carries the same lifetime
      // as the success path.
      return json({ error: "no deeper chart" }, 404, CHART_LIFETIME);
    }
    if (
      err instanceof ChartPartFetchError ||
      err instanceof ChartPartValidationError
    ) {
      Sentry.addBreadcrumb({
        category: "songs",
        level: "warning",
        message: "songs.upstream_failed",
        data: { country: cc, tag: MUSIC_CHARTS_TAG },
      });
      return json({ error: "upstream failed" }, 502, NEVER_STORE);
    }
    throw err;
  }
}

export { readSongsTail as GET };
