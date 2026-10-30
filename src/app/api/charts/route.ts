import { fetchCharts } from "@/lib/charts-client";

// Prerendered, and refreshed when a crawl revalidates the tag on its fetch; the
// daily timer is only the fallback should a revalidation be missed. This is the
// one stored copy of the chart file, so the pages can carry none (ADR-0021).
export const revalidate = 86400;

/** Serves the whole chart file the browser reads once per visit. */
export async function serveCharts(): Promise<Response> {
  const url = process.env.CHARTS_BLOB_URL;
  if (!url) {
    throw new Error("CHARTS_BLOB_URL is not configured");
  }
  return Response.json(await fetchCharts(url));
}

export { serveCharts as GET };
