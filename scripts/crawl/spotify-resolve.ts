import { z } from "zod";

export type SpotifyResolveErrorKind =
  | "miss"
  | "http"
  | "json"
  | "shape"
  | "network"
  | "auth";

export class SpotifyResolveError extends Error {
  constructor(
    public readonly kind: SpotifyResolveErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SpotifyResolveError";
  }
}

const TokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const SearchSchema = z.object({
  tracks: z.object({
    items: z.array(
      z.object({
        external_urls: z.object({ spotify: z.url() }),
      }),
    ),
  }),
});

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

export interface SpotifyToken {
  accessToken: string;
  expiresIn: number;
}

export interface SpotifyFetchOptions {
  fetch?: typeof fetch;
}

/**
 * Client Credentials grant: app-only auth, no user session, the right fit for a
 * cron crawler (ADR-0012). Returns the access token and its lifetime in seconds;
 * the caller is responsible for refreshing before expiry.
 */
export async function fetchSpotifyToken(
  clientId: string,
  clientSecret: string,
  options: SpotifyFetchOptions = {},
): Promise<SpotifyToken> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let res: Response;
  try {
    res = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
  } catch (err) {
    throw new SpotifyResolveError(
      "network",
      `Spotify token network error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (!res.ok) {
    throw new SpotifyResolveError(
      "auth",
      `Spotify token returned ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new SpotifyResolveError(
      "json",
      `Spotify token invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const parsed = TokenSchema.safeParse(json);
  if (!parsed.success) {
    throw new SpotifyResolveError(
      "shape",
      `Spotify token shape mismatch: ${parsed.error.message}`,
    );
  }

  return {
    accessToken: parsed.data.access_token,
    expiresIn: parsed.data.expires_in,
  };
}

/**
 * Two query strategies, tried in order. The scoped form uses `track:`/`artist:`
 * field filters for precision (a cover or karaoke version is less likely to
 * outrank the original). The free-text form is the recall net: Spotify's field
 * filters match the stored field almost literally and miss across scripts (an
 * artist credited romanized, e.g. Spotify "CORTIS" vs the chart's "코르티스"),
 * whereas free-text search consults a broader index that knows the localized
 * alias. Strict-first keeps precision on the common path; the loose pass only
 * runs when the strict one finds nothing.
 */
export function buildSearchQueries(name: string, artist: string): string[] {
  return [`track:${name} artist:${artist}`, `${name} ${artist}`];
}

// Runs one Search query. Returns the top hit's URL, or null when the query
// matched nothing (so the caller can try the next strategy). Throws on transport
// or contract failures, which a retry of the same query would not fix.
async function searchOnce(
  query: string,
  token: string,
  doFetch: typeof fetch,
): Promise<string | null> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "1" });
  const url = `${SEARCH_URL}?${params.toString()}`;

  let res: Response;
  try {
    res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new SpotifyResolveError(
      "network",
      `Spotify search network error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (res.status === 401) {
    throw new SpotifyResolveError("auth", "Spotify search returned 401");
  }
  if (!res.ok) {
    throw new SpotifyResolveError(
      "http",
      `Spotify search returned ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new SpotifyResolveError(
      "json",
      `Spotify search invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const parsed = SearchSchema.safeParse(json);
  if (!parsed.success) {
    throw new SpotifyResolveError(
      "shape",
      `Spotify search shape mismatch: ${parsed.error.message}`,
    );
  }

  return parsed.data.tracks.items[0]?.external_urls.spotify ?? null;
}

/**
 * Resolves a track's canonical Spotify URL via the Search endpoint, trying the
 * scoped then free-text query (see buildSearchQueries). Unlike the search
 * deeplink, `open.spotify.com/track/{id}` is not auth-gated on anonymous mobile
 * web, which is the bug this fixes (#80). Throws `miss` when no strategy matches
 * so the caller can fall back to the search URL.
 */
export async function resolveSpotifyUrl(
  name: string,
  artist: string,
  token: string,
  options: SpotifyFetchOptions = {},
): Promise<string> {
  const doFetch = options.fetch ?? globalThis.fetch;

  for (const query of buildSearchQueries(name, artist)) {
    const hit = await searchOnce(query, token, doFetch);
    if (hit) return hit;
  }

  throw new SpotifyResolveError(
    "miss",
    `Spotify search found no track for "${name}" by "${artist}"`,
  );
}

export type SpotifyResolver = (name: string, artist: string) => Promise<string>;

export interface CreateSpotifyResolverOptions extends SpotifyFetchOptions {
  clientId: string;
  clientSecret: string;
  now?: () => number;
  // Refresh this many ms before the token's stated expiry so an in-flight call
  // never races a hard expiry. Token lifetime is ~1h; the crawl runs longer.
  refreshSkewMs?: number;
}

/**
 * A resolver that caches the Client Credentials token and refreshes it before
 * expiry, so a single long crawl (which outlives the ~1h token) keeps resolving
 * without per-call auth. Returns a function in the `lookupTrack` dependency shape.
 */
export function createSpotifyResolver(
  options: CreateSpotifyResolverOptions,
): SpotifyResolver {
  const now = options.now ?? Date.now;
  const skewMs = options.refreshSkewMs ?? 60_000;
  let token: string | null = null;
  let expiresAt = 0;

  async function ensureToken(): Promise<string> {
    if (token && now() < expiresAt - skewMs) return token;
    const fresh = await fetchSpotifyToken(
      options.clientId,
      options.clientSecret,
      { fetch: options.fetch },
    );
    token = fresh.accessToken;
    expiresAt = now() + fresh.expiresIn * 1000;
    return token;
  }

  async function resolveOnce(name: string, artist: string): Promise<string> {
    const active = await ensureToken();
    return resolveSpotifyUrl(name, artist, active, { fetch: options.fetch });
  }

  return async (name, artist) => {
    try {
      return await resolveOnce(name, artist);
    } catch (err) {
      // Skew-based refresh covers expiry, not a server-side invalidation
      // (rotation/revocation) of a token still valid by our clock. Without this,
      // one early 401 would fall every remaining track back to the search URL.
      // Drop the cached token and retry once; a second auth failure propagates.
      if (
        !(err instanceof SpotifyResolveError) ||
        err.kind !== "auth" ||
        token === null
      ) {
        throw err;
      }
      token = null;
      expiresAt = 0;
      return resolveOnce(name, artist);
    }
  };
}
