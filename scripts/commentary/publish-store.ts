import type { CommentaryStore } from "../../src/lib/commentary-store";

export interface PublishStoreDeps {
  backupLiveStore: () => Promise<string>;
  uploadStore: (store: CommentaryStore) => Promise<string>;
}

export interface PublishedStore {
  url: string;
  backupUrl: string | null;
  total: number;
}

/**
 * Publishes gate survivors over `live`, keeping every live card unless `replace`
 * asks for the survivors to become the whole store. A failed backup throws
 * before the upload, so the store is never overwritten without one.
 */
export async function publishStore(
  survivors: CommentaryStore,
  live: CommentaryStore,
  { replace }: { replace: boolean },
  { backupLiveStore, uploadStore }: PublishStoreDeps,
): Promise<PublishedStore> {
  const next = replace ? survivors : { ...live, ...survivors };

  const backupUrl =
    Object.keys(live).length > 0 ? await backupLiveStore() : null;
  const url = await uploadStore(next);

  return { url, backupUrl, total: Object.keys(next).length };
}
