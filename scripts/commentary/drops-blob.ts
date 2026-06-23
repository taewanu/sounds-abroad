import { put } from "@vercel/blob";

import { DROPS_PATHNAME, DropsStoreSchema, type DropsStore } from "./drops";

/**
 * Blob I/O for the drop ledger. Kept apart from the pure policy in drops.ts so
 * that module stays free of network and SDK imports and its retry logic unit-tests
 * cleanly.
 */

/**
 * Reads the drop ledger. A 404 means it has never been written (a first run), so
 * it starts empty; any other failed read THROWS rather than degrading to empty,
 * because the batch overwrites the ledger and an empty base would erase every
 * tombstone and re-open those tracks to re-drafting.
 */
export async function fetchDrops(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<DropsStore> {
  const res = await fetchImpl(url);
  if (res.status === 404) return {};
  if (!res.ok) {
    throw new Error(`Drop ledger read failed (${res.status}) at ${url}.`);
  }
  const json: unknown = await res.json();
  const parsed = DropsStoreSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Drop ledger at ${url} failed schema validation.`);
  }
  return parsed.data;
}

export async function uploadDrops(drops: DropsStore): Promise<string> {
  const body = JSON.stringify(drops, null, 2);
  const result = await put(DROPS_PATHNAME, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return result.url;
}
