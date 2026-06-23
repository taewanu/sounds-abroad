import { DropsStoreSchema, type DropsStore } from "./drops";

/**
 * Reads the drop ledger. A 404 means it has never been written (a first run), so
 * it starts empty; any other failed read THROWS rather than degrading to empty,
 * because the batch overwrites the ledger and an empty base would erase every
 * tombstone and re-open those tracks to re-drafting. The fetch is injected so the
 * 404-versus-error boundary, the safety property the ledger rests on, is tested
 * without the network.
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
