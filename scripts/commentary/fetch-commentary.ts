import {
  CommentaryStoreSchema,
  type CommentaryStore,
} from "../../src/lib/commentary-store";

/**
 * Reads the published commentary store for the crawl to bake in and for the
 * worklist to diff against. Degrades to null on any failure — commentary is
 * additive and must never abort the crawl (mirrors the carry-forward read).
 */
export async function fetchCommentaryStore(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<CommentaryStore | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const parsed = CommentaryStoreSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Read the store as raw JSON for a writer that merges new entries in, preserving
 * every existing entry verbatim. Two differences from the strict read make it
 * safe to overwrite from: it does NOT validate, so one entry that fails the
 * since-tightened schema cannot void the whole store; and it THROWS on a failed
 * read instead of degrading to null, so a merge-then-overwrite aborts rather
 * than wiping the live cards when a read transiently fails. The cast is the
 * boundary lie this accepts: a merge only spreads and re-keys, so an unvalidated
 * value passes through untouched.
 */
export async function fetchCommentaryStoreRaw(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<CommentaryStore> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Commentary store read failed (${res.status}) at ${url}.`);
  }
  return (await res.json()) as CommentaryStore;
}
