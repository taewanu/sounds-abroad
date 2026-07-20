import { z } from "zod";

export interface LookupResult {
  id: string;
  previewUrl: string;
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
 * How many ids a run asked about against how many came back with a preview.
 *
 * Reported as counts rather than a pass/fail judgement on purpose. A shortfall
 * has two very different causes that no single threshold separates: ids that
 * genuinely have no preview in that storefront, and a batch silently truncated
 * because the endpoint's undocumented ceiling moved below LOOKUP_BATCH_MAX.
 * Truncation returns HTTP 200 with honest-looking JSON, so the only signal it
 * ever produces is this ratio drifting. Picking the line where drift becomes
 * alarming needs history the crawl does not have; publishing the counts lets
 * that line be drawn later, and moved, without a deploy.
 */
export interface LookupTally {
  requested: number;
  resolved: number;
}

export interface LookupTracksOptions {
  fetch?: typeof fetch;
}

/**
 * Ids per request. The endpoint accepts comma-separated ids, and measurement
 * (2026-07-20, distinct ids, one storefront) puts its ceiling at exactly 210:
 * 200 and 210 return in full, 220 and above return 210 and drop the remainder.
 *
 * The overflow is why this constant matters more than a tuning knob would. Past
 * 210 the response is still HTTP 200 with well-formed JSON whose `resultCount`
 * matches the results it does carry, so nothing downstream can tell the batch
 * was truncated: the dropped tracks simply resolve to null previews. 200 sits
 * below the ceiling with room for it to move.
 */
export const LOOKUP_BATCH_MAX = 200;

const LookupTrackSchema = z.object({
  trackId: z.number().int(),
  previewUrl: z.url(),
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

    resolved.set(id, { id, previewUrl: track.data.previewUrl });
  }

  return resolved;
}
