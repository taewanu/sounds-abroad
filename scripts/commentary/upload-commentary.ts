import type { CommentaryStore } from "../../src/lib/commentary-store";
import { copyObject, putJson } from "../lib/object-store";

export const COMMENTARY_PATHNAME = "commentary/v1/commentary.json";

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
