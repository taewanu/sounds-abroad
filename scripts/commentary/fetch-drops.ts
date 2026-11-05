import { getJson } from "../lib/object-store";

import { DROPS_PATHNAME, DropsStoreSchema, type DropsStore } from "./drops";

/**
 * Reads the drop ledger from the key the batch overwrites. A missing ledger has
 * never been written (a first run), so it starts empty; a failed read or a bad
 * payload THROWS rather than reading as empty, because an empty base would erase
 * every tombstone and re-open those tracks to re-drafting.
 */
export async function readDrops(
  read: (key: string) => Promise<unknown> = getJson,
): Promise<DropsStore> {
  const json = await read(DROPS_PATHNAME);
  if (json === null) return {};
  const parsed = DropsStoreSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Drop ledger at ${DROPS_PATHNAME} failed schema validation.`,
    );
  }
  return parsed.data;
}
