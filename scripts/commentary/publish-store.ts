import type { CommentaryStore } from "../../src/lib/commentary-store";

export interface PublishStoreDeps {
  readLiveStore: () => Promise<CommentaryStore>;
  backupLiveStore: () => Promise<string>;
  uploadStore: (store: CommentaryStore) => Promise<string>;
}

export interface PublishedStore {
  url: string;
  backupUrl: string | null;
  total: number;
}

/**
 * Publishes gate survivors, keeping every live card unless `replace` asks for
 * the survivors to become the whole store. A failed read throws before anything
 * is written, so a transient failure can't wipe the live cards.
 */
export async function publishStore(
  survivors: CommentaryStore,
  { replace }: { replace: boolean },
  { readLiveStore, backupLiveStore, uploadStore }: PublishStoreDeps,
): Promise<PublishedStore> {
  const live = await readLiveStore();
  const next = replace ? survivors : { ...live, ...survivors };

  const backupUrl =
    Object.keys(live).length > 0 ? await backupLiveStore() : null;
  const url = await uploadStore(next);

  return { url, backupUrl, total: Object.keys(next).length };
}
