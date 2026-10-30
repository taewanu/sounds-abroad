import type {
  ChartFile,
  PlaylistFile,
  SongsTailFile,
} from "../../src/lib/chart-schema";
import { putJson } from "../lib/object-store";

const BLOB_PATHNAME = "charts/v1/charts.json";
const PREV_BLOB_PATHNAME = "charts/v1/charts-prev.json";
const PLAYLIST_BLOB_PREFIX = "charts/v1/playlists";
const SONGS_TAIL_PREFIX = "charts/v1/songs";

/**
 * Publishes compact because the app's tagged read must fit the Next.js data
 * cache, which stores the body base64-encoded and refuses entries over 2 MB.
 * Compact fits with little margin, so growth in the file can overflow it again.
 */
export async function uploadCharts(chartFile: ChartFile): Promise<string> {
  return putJson(BLOB_PATHNAME, JSON.stringify(chartFile));
}

/**
 * Snapshots the outgoing charts before the publish overwrites them in place:
 * the worklist's rank-movement triggers (ADR-0007) diff the live charts
 * against this copy, read back via CHARTS_PREV_BLOB_URL. Compact like the live
 * file, which makes it smaller for the worklist to fetch.
 */
export async function uploadPreviousCharts(
  chartFile: ChartFile,
): Promise<string> {
  return putJson(PREV_BLOB_PATHNAME, JSON.stringify(chartFile));
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

/**
 * Publishes one country's chart beyond the eager rows as its own object. Keyed
 * by country, unlike the playlist files, because a songs chart belongs to
 * exactly one storefront and is never shared.
 */
export async function uploadSongsTail(file: SongsTailFile): Promise<string> {
  return putJson(
    `${SONGS_TAIL_PREFIX}/${file.code}.json`,
    JSON.stringify(file),
  );
}
