import type { ZodType } from "zod";

import { MUSIC_CHARTS_TAG } from "./cache-tags";
import {
  PlaylistFileSchema,
  SongsTailFileSchema,
  type PlaylistFile,
  type SongsTailFile,
} from "./chart-schema";
import { chartsStoreHeaders } from "./charts-store-fetch";

/**
 * How long the server waits on the store. Without a bound a hung connection
 * never settles, and a chart waiting on one keeps telling the listener it is
 * loading with no way to fail. Generous against a file of this size, so a slow
 * network still lands.
 */
const READ_TIMEOUT_MS = 10_000;

export class ChartPartFetchError extends Error {
  constructor(
    public readonly part: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChartPartFetchError";
  }
}

export class ChartPartValidationError extends Error {
  constructor(
    public readonly part: string,
    public readonly issues: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ChartPartValidationError";
  }
}

/**
 * Locates one part of the published charts from the charts URL, since the crawl
 * writes them all into the same store and only the charts URL is configured.
 * Swaps the final segment rather than reassembling the path, so a change of host
 * or prefix carries through untouched.
 */
export function chartPartUrl(
  chartsUrl: string,
  folder: string,
  name: string,
): string {
  const cut = chartsUrl.lastIndexOf("/");
  if (cut === -1) {
    throw new ChartPartFetchError(
      name,
      0,
      `Cannot derive a ${folder} URL from "${chartsUrl}"`,
    );
  }
  return `${chartsUrl.slice(0, cut)}/${folder}/${encodeURIComponent(name)}.json`;
}

/**
 * Reads one part of the published charts.
 *
 * Shares the charts cache tag, because one crawl publishes every part, so a
 * revalidation that refreshes the charts must not leave a part behind on the
 * previous generation.
 *
 * A missing part is an ordinary outcome rather than a defect: a country carried
 * forward can advertise more than the latest run rewrote, so callers handle the
 * failure rather than assuming every part is there.
 */
async function fetchChartPart<T>(
  chartsUrl: string,
  folder: string,
  name: string,
  schema: ZodType<T>,
  identifies: (parsed: T) => string,
): Promise<T> {
  const url = chartPartUrl(chartsUrl, folder, name);

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "force-cache",
      next: { tags: [MUSIC_CHARTS_TAG] },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      headers: chartsStoreHeaders(),
    });
  } catch (err) {
    throw new ChartPartFetchError(
      name,
      0,
      `${folder} fetch failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    throw new ChartPartFetchError(
      name,
      res.status,
      `${folder} fetch failed: ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new ChartPartFetchError(
      name,
      res.status,
      `${folder} fetch failed: invalid JSON (${err instanceof Error ? err.message : "parse error"})`,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ChartPartValidationError(
      name,
      parsed.error.issues,
      `${folder} payload failed schema validation`,
    );
  }

  // The store answers by path, so a payload naming something else means the
  // wrong object was served rather than a merely malformed one.
  const served = identifies(parsed.data);
  if (served !== name) {
    throw new ChartPartValidationError(
      name,
      { served },
      `${folder} payload is for ${served}, not ${name}`,
    );
  }

  return parsed.data;
}

/** Reads one playlist's track list (ADR-0016). */
export function fetchPlaylistFile(
  chartsUrl: string,
  playlistId: string,
): Promise<PlaylistFile> {
  return fetchChartPart(
    chartsUrl,
    "playlists",
    playlistId,
    PlaylistFileSchema,
    (file) => file.id,
  );
}

/** Reads one country's chart beyond the rows that travel eagerly. */
export function fetchSongsTail(
  chartsUrl: string,
  countryCode: string,
): Promise<SongsTailFile> {
  return fetchChartPart(
    chartsUrl,
    "songs",
    countryCode,
    SongsTailFileSchema,
    (file) => file.code,
  );
}
