# ADR-0012: Spotify track-deeplink resolution at crawl time

**Status:** Accepted (2026-06-29).

## Context

Each track carries a Spotify link-out. We had no Spotify track ID, so the link was a search deeplink, `open.spotify.com/search/{name artist}`. On anonymous mobile web (the common case on this app) Spotify auth-gates that URL: logged-out visitors bounce to `/search/recent` with an empty box, losing the query (#80). The exact-track URL, `open.spotify.com/track/{id}`, is not gated anywhere and lands on the song with a 30s preview.

Resolving the track ID needs a Spotify Web API call. Two facts shaped the design:

- The Charts API (the original reason we believed no ID was reachable) is blocked for new apps, but the general **Search** endpoint is not, and it runs under the **Client Credentials** flow: app-only auth, no user session, which is the right fit for a cron crawler (ADR-0002).
- There is no free ISRC path. iTunes Search and Lookup do not return `isrc`, so resolution is a name+artist Search, not an ID-to-ID map.

The tension with [ADR-0007](0007-out-of-band-human-curated-commentary.md), which rejected in-crawl work partly on runtime budget, is real: this adds a per-track external call to the crawl. It is acceptable because resolution is deterministic data, not an unreviewed public claim, and the runtime cost is contained (see Decision).

## Decision

Resolve each track's Spotify URL during the crawl via the Search endpoint, store the resolved `/track/{id}` URL when found, and fall back to the existing search URL otherwise.

- **Auth:** Client Credentials, app-only. `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are GitHub Actions secrets (the crawl runs in cron). The token is cached and refreshed before expiry: its ~1h lifetime is shorter than the crawl's runtime, so a long run would otherwise expire mid-flight.
- **Query:** two passes, `limit=1`. A scoped pass with field filters (`track:{name} artist:{artist}`) for precision, biasing the matcher toward our trusted Apple-RSS metadata so a cover is less likely to outrank the original; on a miss, a free-text pass (`{name} {artist}`) for recall. Field filters match Spotify's stored field nearly literally and miss across scripts (an artist credited romanized, e.g. Spotify "CORTIS" vs the chart's "코르티스"); free-text search consults a broader index that knows the localized alias. A live `kr` run showed the scoped-only form missing an entire artist's catalog (80% resolution); the free-text fallback recovers those while the strict-first order preserves precision on the common path.
- **Fallback:** any resolution failure (miss, HTTP, network, shape, auth) degrades to the search URL. Never worse than before #80. Credentials absent → resolution is skipped entirely and every track uses the search URL.
- **Throttle:** a separate throttle from the iTunes one. iTunes is the binding rate limit (20 req/min, a 3s gap); Spotify's per-app limit is far more generous. A shared throttle would space every Spotify call 3s apart too, adding ~50 min and pushing past the crawl's runtime budget. A separate, short-gap throttle lets resolution calls fill iTunes' idle 3s windows, so added wall-clock is ~network latency.
- **Field rename:** the stored field is `spotifyUrl`, not `spotifySearchUrl`. It now usually holds a track deeplink with search as fallback, so the old name described the no-longer-common case.

### Why resolve-with-fallback over hard-require

The fix must never regress the current behavior. A no-result, a transient error, or missing credentials each leaves the track exactly where it is today (the search URL), so the feature is purely additive and the crawl never aborts on Spotify trouble, matching the carry-forward contract it already uses for failed fetches.

## Consequences

**Positive**

- Logged-out mobile visitors land on the exact track, the bug in #80.
- Client Credentials keeps the crawl free of any user session; runtime does not depend on a login.
- The separate throttle keeps the crawl inside its runtime budget despite the added per-track call.

**Negative**

- A new external dependency in the crawl: Spotify Search availability and rate limits now affect link quality (not correctness, thanks to the fallback).
- A small fraction of tracks resolve to a wrong or no match; wrong matches surface as a slightly-off track page, no-match falls back to search. The free-text fallback trades a little precision for recall, but only on tracks the strict pass already missed, where the alternative was the broken search URL anyway.
- Registering the Development Mode app requires the owner to hold Spotify Premium (a Feb 2026 policy change); runtime auth does not.

**Neutral**

- One transition run: the currently-published blob still carries `spotifySearchUrl`, so carry-forward is skipped for the first run after deploy until the next crawl rewrites the blob in the new shape. Self-healing.
- Resolution is name+artist, not ISRC; a free ISRC source would let us tighten matching later without reshaping the store.
