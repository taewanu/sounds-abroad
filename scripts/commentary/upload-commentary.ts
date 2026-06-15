import { copy, put } from "@vercel/blob";

import type { CommentaryStore } from "../../src/lib/commentary-store";

export const COMMENTARY_PATHNAME = "commentary/v1/commentary.json";

export async function uploadCommentary(
  store: CommentaryStore,
): Promise<string> {
  const body = JSON.stringify(store, null, 2);
  const result = await put(COMMENTARY_PATHNAME, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return result.url;
}

/**
 * Snapshots the live store to a timestamped path before an overwrite, so a bad
 * publish can be rolled back by reading the backup.
 */
export async function backupCommentary(
  fromUrl: string,
  timestamp: string,
): Promise<string> {
  const safe = timestamp.replace(/[:.]/g, "-");
  const result = await copy(
    fromUrl,
    `commentary/v1/backups/commentary-${safe}.json`,
    {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    },
  );
  return result.url;
}
