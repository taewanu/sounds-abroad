import { z } from "zod";

export interface LookupResult {
  id: string;
  previewUrl: string;
  genre: string | null;
}

export type ItunesLookupErrorKind = "http" | "json" | "shape" | "network";

export class ItunesLookupError extends Error {
  constructor(
    public readonly ids: readonly string[],
    public readonly cc: string,
    public readonly kind: ItunesLookupErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ItunesLookupError";
  }
}

/**
 * Counts, not a verdict: a shortfall is either ids with no preview in that
 * storefront or a silently truncated batch, and no threshold drawn here
 * separates them. The ratio drifting across runs does.
 */
export interface LookupTally {
  requested: number;
  resolved: number;
}

export interface LookupTracksOptions {
  fetch?: typeof fetch;
}

/**
 * Ids per request, kept below the endpoint's measured ceiling of 210 (2026-07-20).
 * Overflow past that returns HTTP 200 with the excess ids simply absent, which
 * nothing downstream can tell from a genuine miss, so the margin is the defence.
 */
export const LOOKUP_BATCH_MAX = 200;

const LookupTrackSchema = z.object({
  trackId: z.number().int(),
  previewUrl: z.url(),
  primaryGenreName: z.string().min(1).optional(),
});

const LookupResponseSchema = z.object({
  resultCount: z.number().int(),
  results: z.array(z.unknown()),
});

function lookupUrl(ids: readonly string[], cc: string): string {
  const params = new URLSearchParams({
    id: ids.join(","),
    country: cc,
    entity: "song",
    // Pinned so one playlist's genre histogram is mergeable with another's;
    // unpinned, each storefront answers in its own language. Track and artist
    // names are unaffected.
    lang: "en_us",
  });
  return `https://itunes.apple.com/lookup?${params.toString()}`;
}

/** Splits ids into request-sized batches, preserving order. */
export function batchIds(
  ids: readonly string[],
  size: number = LOOKUP_BATCH_MAX,
): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}

/**
 * Resolves preview URLs for up to LOOKUP_BATCH_MAX ids in one request, keyed by
 * id. Callers batch with `batchIds` rather than having this chunk internally, so
 * every request still takes its own throttle slot.
 *
 * Only whole-request failures throw. An id Apple omits, or returns without a
 * usable preview, is simply absent from the map: a track with no preview is
 * ordinary, and failing its 99 batch-mates over it would be worse than the miss.
 */
export async function lookupTracks(
  ids: readonly string[],
  cc: string,
  options: LookupTracksOptions = {},
): Promise<Map<string, LookupResult>> {
  if (ids.length === 0) return new Map();
  if (ids.length > LOOKUP_BATCH_MAX) {
    // Silently truncated otherwise, which is the one failure this module exists
    // to keep visible. Callers split with batchIds so each request takes its
    // own throttle slot.
    throw new RangeError(
      `lookupTracks got ${ids.length} ids, over LOOKUP_BATCH_MAX (${LOOKUP_BATCH_MAX}); split with batchIds`,
    );
  }

  const doFetch = options.fetch ?? globalThis.fetch;
  const url = lookupUrl(ids, cc);

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (err) {
    throw new ItunesLookupError(
      ids,
      cc,
      "network",
      `iTunes Lookup network error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (!res.ok) {
    throw new ItunesLookupError(
      ids,
      cc,
      "http",
      `iTunes Lookup returned ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new ItunesLookupError(
      ids,
      cc,
      "json",
      `iTunes Lookup invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const envelope = LookupResponseSchema.safeParse(json);
  if (!envelope.success) {
    throw new ItunesLookupError(
      ids,
      cc,
      "shape",
      `iTunes Lookup envelope mismatch: ${envelope.error.message}`,
    );
  }

  const requested = new Set(ids);
  const resolved = new Map<string, LookupResult>();
  for (const raw of envelope.data.results) {
    const track = LookupTrackSchema.safeParse(raw);
    if (!track.success) continue;

    const id = String(track.data.trackId);
    if (!requested.has(id)) continue;

    resolved.set(id, {
      id,
      previewUrl: track.data.previewUrl,
      genre: track.data.primaryGenreName ?? null,
    });
  }

  return resolved;
}
