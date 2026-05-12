import { z } from "zod";

export interface LookupResult {
  id: string;
  previewUrl: string;
}

export type ItunesLookupErrorKind =
  | "miss"
  | "http"
  | "json"
  | "shape"
  | "network";

export class ItunesLookupError extends Error {
  constructor(
    public readonly id: string,
    public readonly cc: string,
    public readonly kind: ItunesLookupErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ItunesLookupError";
  }
}

export interface LookupTrackOptions {
  fetch?: typeof fetch;
}

const LookupTrackSchema = z.object({
  trackId: z.number().int(),
  previewUrl: z.url(),
});

const LookupResponseSchema = z.object({
  resultCount: z.number().int(),
  results: z.array(z.unknown()),
});

function lookupUrl(id: string, cc: string): string {
  const params = new URLSearchParams({ id, country: cc, entity: "song" });
  return `https://itunes.apple.com/lookup?${params.toString()}`;
}

export async function lookupTrack(
  id: string,
  cc: string,
  options: LookupTrackOptions = {},
): Promise<LookupResult> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = lookupUrl(id, cc);

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (err) {
    throw new ItunesLookupError(
      id,
      cc,
      "network",
      `iTunes Lookup network error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (!res.ok) {
    throw new ItunesLookupError(
      id,
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
      id,
      cc,
      "json",
      `iTunes Lookup invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const envelope = LookupResponseSchema.safeParse(json);
  if (!envelope.success) {
    throw new ItunesLookupError(
      id,
      cc,
      "shape",
      `iTunes Lookup envelope mismatch: ${envelope.error.message}`,
    );
  }

  if (envelope.data.resultCount === 0 || envelope.data.results.length === 0) {
    throw new ItunesLookupError(
      id,
      cc,
      "miss",
      `iTunes Lookup found no track for id=${id}`,
    );
  }

  const track = LookupTrackSchema.safeParse(envelope.data.results[0]);
  if (!track.success) {
    throw new ItunesLookupError(
      id,
      cc,
      "shape",
      `iTunes Lookup track shape mismatch: ${track.error.message}`,
    );
  }

  return {
    id: String(track.data.trackId),
    previewUrl: track.data.previewUrl,
  };
}
