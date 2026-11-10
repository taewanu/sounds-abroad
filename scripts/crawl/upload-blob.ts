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
 * Next.js 16.4.3 refuses to cache a fetch whose entry, measured as
 * `JSON.stringify(entry).length`, exceeds this (`IncrementalCache.set` in
 * `node_modules/next/dist/server/lib/incremental-cache/index.js`).
 */
export const DATA_CACHE_ENTRY_CAP = 2 * 1024 * 1024;

/**
 * Allowance for what the entry holds beside the body: the response's headers,
 * status and URL, which the store decides at read time (887 characters on
 * 2026-11-10).
 */
export const DATA_CACHE_ENTRY_OVERHEAD = 1024;

/**
 * Where the crawl starts warning: the 2% left below the cap holds about 31 KB
 * of chart file, more than the 26 KB the largest country took on 2026-11-10.
 */
export const DATA_CACHE_WARN_SIZE = Math.floor(DATA_CACHE_ENTRY_CAP * 0.98);

/**
 * The size Next.js measures against the cap for a response carrying `body`,
 * which it stores base64-encoded: four characters for every three bytes.
 */
export function dataCacheEntrySize(body: string): number {
  return 4 * Math.ceil(Buffer.byteLength(body) / 3) + DATA_CACHE_ENTRY_OVERHEAD;
}

/**
 * Publishes compact because the app's tagged read must fit the Next.js data
 * cache; `onNearCacheCap` hears when the published body's entry passes the
 * warning size.
 */
export async function uploadCharts(
  chartFile: ChartFile,
  onNearCacheCap?: (entrySize: number) => void,
): Promise<string> {
  const body = JSON.stringify(chartFile);
  const url = await putJson(BLOB_PATHNAME, body);
  const entrySize = dataCacheEntrySize(body);
  if (entrySize > DATA_CACHE_WARN_SIZE) onNearCacheCap?.(entrySize);
  return url;
}

/**
 * Snapshots the outgoing charts before the publish overwrites them in place:
 * the worklist's rank-movement triggers (ADR-0007) diff the live charts
 * against this copy, read back via CHARTS_PREV_BLOB_URL.
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
