import type { ChartFile, PlaylistFile } from "../../src/lib/chart-schema";
import { putJson } from "../lib/object-store";

const BLOB_PATHNAME = "charts/v1/charts.json";
const PREV_BLOB_PATHNAME = "charts/v1/charts-prev.json";
const PLAYLIST_BLOB_PREFIX = "charts/v1/playlists";

export async function uploadCharts(chartFile: ChartFile): Promise<string> {
  return putJson(BLOB_PATHNAME, JSON.stringify(chartFile, null, 2));
}

/**
 * Snapshots the outgoing charts before the publish overwrites them in place:
 * the worklist's rank-movement triggers (ADR-0007) diff the live charts
 * against this copy, read back via CHARTS_PREV_BLOB_URL.
 */
export async function uploadPreviousCharts(
  chartFile: ChartFile,
): Promise<string> {
  return putJson(PREV_BLOB_PATHNAME, JSON.stringify(chartFile, null, 2));
}

/**
 * Publishes one playlist's track list as its own object (ADR-0016). Keyed by
 * playlist id, not by country, so a playlist surviving in several storefronts is
 * stored and cached once.
 */
export async function uploadPlaylistFile(file: PlaylistFile): Promise<string> {
  return putJson(
    `${PLAYLIST_BLOB_PREFIX}/${file.id}.json`,
    JSON.stringify(file),
  );
}
