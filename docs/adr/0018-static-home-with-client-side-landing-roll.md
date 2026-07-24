# ADR-0018: Static home route with a client-side landing roll

**Status:** Accepted (2026-07-24). Supersedes ADR-0004.

## Context

ADR-0004 rendered the home route dynamically so the chart could ship in the
initial HTML (#74): `await connection()` excluded `/` from prerendering, the
server rolled the bare-`/` landing country, and `useSearchParams` server-rendered
the sheet. Its stated Negative — "a function invocation per request … a real
meter at scale" — priced that meter on human traffic scale. It materialized
through a different multiplier: crawler bots.

Thirty days of production data (2026-07): 7 human visitors, while bots invoked
the home function ~65 times/hour. Each invocation moved a ~250KB response
across the CDN↔function boundary (Fast Origin Transfer), ~2.3GB/week, pinning
the Hobby plan's 10GB/30-day rolling window at 100% (PR #308). Hobby has no
billing cycle: exceeding the cap pauses the workspace, and community reports
show pauses lift by manual support review, not by waiting. Per-request
rendering also masked a second defect: the charts payload (2.9MB) exceeds the
data cache's 2MB item cap, so every render silently re-downloaded it from R2
(#310).

Options weighed:

- **Stay dynamic, block the bots** — WAF rules or bot management. Rejected:
  AI crawlers are also how the site gets discovered and cited; the fleet churns
  faster than three free-tier WAF rules; and the cost model stays one bot fleet
  away from a pause.
- **Static per-country routes** (`/c/[cc]`) — ADR-0004's deferred V2 option.
  Still deferred (#309 revives it for the OG cards only): it changes the shipped
  URL scheme and is not needed to stop the bleed.
- **Static home + client-side landing roll** — chosen. Removes the per-request
  function entirely; the CDN answers every request.

## Decision

Prerender `/` and move everything request-scoped to the browser.

- `page.tsx` drops `await connection()`. `generateMetadata` no longer reads
  `searchParams` (a dynamic API); the home metadata is a static generic card.
  Per-country OG cards return via `/c/[code]` (#309).
- `ChartScreen` rolls the landing country after hydration through
  `useSyncExternalStore`: server snapshot `null` (the prerendered HTML is
  country-neutral; the globe backdrop carries the first frame), client snapshot
  a memoized one-time roll. A `?cc=` arrival short-circuits the roll. The
  sanctioned hydration escape replaces both the server roll and an
  effect-with-setState cascade.
- `page.tsx` wraps `ChartScreen` in `<Suspense>`: under static rendering
  `useSearchParams` bails its subtree to client rendering, which is exactly the
  boundary the neutral first frame needs.
- Freshness: crawl-completion revalidation (tag, #272) plus
  `export const revalidate = 3600` as a safety net, because the >2MB payload
  cannot enter the data cache and the tag path alone is unverified there (#310).
- `/og` responses carry `s-maxage=86400, stale-while-revalidate=604800`; the
  route stays dynamic but crawler traffic lands on the CDN copy.

## Consequences

**Positive**

- Fast Origin Transfer falls from ~10GB/month to ~0.2GB/month (~25 regenerations
  a day instead of ~1,600 bot renders); the pause risk is gone and the rolling
  window drains on its own.
- Bot and cold-visitor responses come straight from the CDN — faster than the
  render they used to wait for.
- The hidden R2 re-download shrinks with the render count (still capped by #310).

**Negative**

- The chart leaves the initial HTML — the exact goal of #74 is reversed. The
  first frame is the globe plus an empty sheet until the client roll lands.
  Accepted: the paint gate was re-scoped off LCP in #69, the measured human
  audience is single-digit, and the cost side had become existential for the
  free tier.
- Home OG cards are generic until #309.
- Prerendering makes every build fetch the charts blob: an R2 outage or a
  missing `CHARTS_BLOB_URL` now fails the build, where the dynamic route
  deferred that failure to request time.

**Neutral**

- ADR-0004's hybrid country model (URL as source of truth, instant client
  switches via `replaceState`) survives unchanged; only the fallback moved from
  a server prop to a client roll.
- `ENABLE_DEBUG` on `/debug/charts` is now evaluated at build time; enabling it
  in a deployed environment requires a rebuild. Acceptable for a local-only
  debug surface.
- The bare-`/` no-repeat dedup ADR-0004 dropped stays dropped; a client-side
  roll could restore it from localStorage as a V2 candidate.
