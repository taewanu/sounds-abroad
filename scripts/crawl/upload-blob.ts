import { put } from "@vercel/blob";

import type { ChartFile } from "../../src/lib/chart-schema";

const BLOB_PATHNAME = "charts/v1/charts.json";

export async function uploadCharts(chartFile: ChartFile): Promise<string> {
  const body = JSON.stringify(chartFile, null, 2);
  const result = await put(BLOB_PATHNAME, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return result.url;
}
