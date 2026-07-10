import type { ChartFile } from "../../src/lib/chart-schema";
import { fetchPublishedCharts } from "../crawl/published-charts";

/**
 * Loads the crawl-maintained previous-chart snapshot for the worklist's
 * rank-movement triggers, and states on stderr (clear of --json stdout)
 * whether those triggers are live this run. Without the snapshot the
 * worklist silently falls back to absolute prominence, which reads like a
 * working feature while quietly narrowing ADR-0007's significance trigger.
 */
export async function loadPreviousCharts(
  prevUrl: string | undefined,
  fetchCharts: (
    url: string,
  ) => Promise<ChartFile | null> = fetchPublishedCharts,
): Promise<ChartFile | null> {
  if (!prevUrl) {
    console.warn(
      "[worklist] CHARTS_PREV_BLOB_URL not set: movement triggers inert; only top-debut and local-gem fire.",
    );
    return null;
  }
  const previous = await fetchCharts(prevUrl);
  if (!previous) {
    console.warn(
      `[worklist] previous snapshot unreadable at ${prevUrl}: movement triggers inert this run.`,
    );
    return null;
  }
  console.warn("[worklist] movement triggers live (previous snapshot loaded).");
  return previous;
}
