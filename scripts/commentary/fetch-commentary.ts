import { CommentarySchema } from "../../src/lib/chart-schema";
import { type CommentaryStore } from "../../src/lib/commentary-store";

/**
 * Reads the published commentary store for the crawl to bake in and for the
 * worklist to diff against. Validates per entry, dropping only the entries
 * that fail — one entry invalidated by a since-tightened schema must not void
 * the whole store (the bake is authoritative, so a voided store would clear
 * every freshly-crawled card). Degrades to null on a failed read, a payload
 * that is not an object, or a non-empty store where no entry survives (total
 * loss reads as schema drift, not an empty store) — commentary is additive
 * and must never abort the crawl.
 */
export async function fetchCommentaryStore(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<CommentaryStore | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return null;
    }

    const store: CommentaryStore = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(json)) {
      const parsed = CommentarySchema.safeParse(value);
      if (parsed.success) {
        store[key] = parsed.data;
      } else {
        dropped.push(key);
      }
    }
    if (dropped.length > 0) {
      console.warn(
        `[commentary] dropped ${dropped.length} invalid entr${dropped.length === 1 ? "y" : "ies"}: ${dropped.join(", ")}`,
      );
    }
    if (dropped.length > 0 && Object.keys(store).length === 0) return null;
    return store;
  } catch {
    return null;
  }
}

/**
 * Read the store as raw JSON for a writer that merges new entries in, preserving
 * every existing entry verbatim. Two differences from the baking read make it
 * safe to overwrite from: it preserves even entries the schema rejects (the
 * baking read drops them, which is fine for display but would erase them from
 * a merge-then-overwrite); and it THROWS on a failed read instead of degrading
 * to null, so a merge-then-overwrite aborts rather than wiping the live cards
 * when a read transiently fails. Per-entry VALUES go unvalidated (a merge only
 * spreads and re-keys them), but the top-level shape is checked: a non-object
 * payload (null, an array) would otherwise spread into an empty or malformed
 * merge and persist a broken store.
 */
export async function fetchCommentaryStoreRaw(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<CommentaryStore> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Commentary store read failed (${res.status}) at ${url}.`);
  }
  const json: unknown = await res.json();
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`Commentary store is not a JSON object at ${url}.`);
  }
  return json as CommentaryStore;
}
