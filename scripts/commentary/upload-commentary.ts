import type { CommentaryStore } from "../../src/lib/commentary-store";
import { copyObject, getJson, putJson } from "../lib/object-store";

export const COMMENTARY_PATHNAME = "commentary/v1/commentary.json";

/**
 * Reads the live store raw, the object every publish overwrites. Entries the
 * schema rejects are kept, so a merge can't erase them. A missing store reads
 * as empty, and anything but a JSON object throws, so a bad read never becomes
 * an empty base that a merge would publish over the live cards.
 */
export async function readLiveCommentary(
  read: (key: string) => Promise<unknown> = getJson,
): Promise<CommentaryStore> {
  const json = await read(COMMENTARY_PATHNAME);
  if (json === null) return {};
  if (typeof json !== "object" || Array.isArray(json)) {
    throw new Error(
      `Commentary store at ${COMMENTARY_PATHNAME} is not a JSON object.`,
    );
  }
  return json as CommentaryStore;
}

export async function uploadCommentary(
  store: CommentaryStore,
): Promise<string> {
  return putJson(COMMENTARY_PATHNAME, JSON.stringify(store, null, 2));
}

/**
 * Snapshots the live store to a timestamped path before an overwrite, so a bad
 * publish can be rolled back by reading the backup. The source is always the
 * live store, so callers pass only when the snapshot is taken.
 */
export async function backupCommentary(timestamp: string): Promise<string> {
  const safe = timestamp.replace(/[:.]/g, "-");
  return copyObject(
    COMMENTARY_PATHNAME,
    `commentary/v1/backups/commentary-${safe}.json`,
  );
}
