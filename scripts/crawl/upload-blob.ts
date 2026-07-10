import { put } from "@vercel/blob";

import type { ChartFile } from "../../src/lib/chart-schema";

const BLOB_PATHNAME = "charts/v1/charts.json";
const PREV_BLOB_PATHNAME = "charts/v1/charts-prev.json";

async function putCharts(
  pathname: string,
  chartFile: ChartFile,
): Promise<string> {
  const body = JSON.stringify(chartFile, null, 2);
  const result = await put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return result.url;
}

export async function uploadCharts(chartFile: ChartFile): Promise<string> {
  return putCharts(BLOB_PATHNAME, chartFile);
}

/**
 * Snapshots the outgoing charts before the publish overwrites them in place:
 * the worklist's rank-movement triggers (ADR-0007) diff the live charts
 * against this copy, read back via CHARTS_PREV_BLOB_URL.
 */
export async function uploadPreviousCharts(
  chartFile: ChartFile,
): Promise<string> {
  return putCharts(PREV_BLOB_PATHNAME, chartFile);
}
