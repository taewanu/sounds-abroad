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
