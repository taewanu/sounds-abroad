import { CommentarySchema } from "../../src/lib/chart-schema";
import { fetchChartsStore } from "../../src/lib/charts-store-fetch";
import { type CommentaryStore } from "../../src/lib/commentary-store";

export interface SalvagedStore {
  store: CommentaryStore;
  droppedKeys: string[];
}

/**
 * Validates a store per entry, keeping the survivors and naming the dropped
 * keys. Pure and shared by both consumers of the raw payload: the baking read
 * keeps only valid entries, and the draft batch re-queues exactly the keys
 * dropped here, so a preserved-but-invalid entry cannot block its own
 * regeneration.
 */
export function salvageCommentaryStore(raw: object): SalvagedStore {
  const store: CommentaryStore = {};
  const droppedKeys: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const parsed = CommentarySchema.safeParse(value);
    if (parsed.success) {
      store[key] = parsed.data;
    } else {
      droppedKeys.push(key);
    }
  }
  return { store, droppedKeys };
}

/**
 * Reads the published commentary store for the crawl to bake in and for the
 * worklist to diff against. Validates per entry, dropping only the entries
 * that fail: one entry invalidated by a since-tightened schema must not void
 * the whole store (the bake is authoritative, so a voided store would clear
 * every freshly-crawled card). Degrades to null on a failed read, a payload
 * that is not an object, or a non-empty store where no entry survives (total
 * loss reads as schema drift, not an empty store); commentary is additive
 * and must never abort the crawl.
 */
export async function fetchCommentaryStore(
  url: string,
  fetchImpl: typeof fetch = fetchChartsStore,
): Promise<CommentaryStore | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return null;
    }

    const { store, droppedKeys } = salvageCommentaryStore(json);
    if (droppedKeys.length > 0) {
      console.warn(
        `[commentary] dropped ${droppedKeys.length} invalid entr${droppedKeys.length === 1 ? "y" : "ies"}: ${droppedKeys.join(", ")}`,
      );
    }
    if (droppedKeys.length > 0 && Object.keys(store).length === 0) return null;
    return store;
  } catch {
    return null;
  }
}

/**
 * Wraps a commentary read so a null result fires the degradation signal and
 * still passes through to the caller. The wrapper exists to be testable: the
 * signal is the only trace that a configured store failed to bake, and an
 * inline try/catch at the wiring site had no test able to reach it.
 */
export function withCommentaryDegradationSignal(
  fetchStore: () => Promise<CommentaryStore | null>,
  onUnavailable: () => void,
): () => Promise<CommentaryStore | null> {
  return async () => {
    const store = await fetchStore();
    if (store === null) onUnavailable();
    return store;
  };
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
  fetchImpl: typeof fetch = fetchChartsStore,
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
