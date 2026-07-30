import * as Sentry from "@sentry/nextjs";

import {
  CHART_LIFETIME,
  MISCONFIGURED_MESSAGE,
  NEVER_STORE,
  json,
} from "@/lib/api-response";
import { MUSIC_CHARTS_TAG } from "@/lib/cache-tags";
import {
  ChartPartFetchError,
  ChartPartValidationError,
  fetchSongsTail,
} from "@/lib/chart-parts";

export const runtime = "nodejs";

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
