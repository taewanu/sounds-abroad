# ADR-0021: The chart file travels apart from the pages

**Status:** Accepted (2026-10-29). Amends [ADR-0016](0016-eager-songs-lazy-playlist-tracks.md) (how the eager set reaches the browser; what is eager is unchanged), [ADR-0018](0018-static-home-with-client-side-landing-roll.md) (its freshness bullet) and [ADR-0019](0019-path-segment-country-urls.md) (its per-route fallback timer).

## Context

Vercel team `wanu` reached 75% of the Hobby plan's free ISR write allowance: 200K units of 8 KB stored, over a rolling 30 days. At 100% the project pauses until a manual review.

Every chart page (`/` and the 63 `/c/[code]` pages) renders one body that passes the whole `fetchCharts()` result to the client component `ChartScreen`, so each page stores the chart file inside itself. Measured on production `/c/kr` (2026-10-29): 1,651 KB of HTML, of which 1,597 KB is a single RSC chunk holding the chart. The page without it is about 50 KB. The RSC payload is stored again beside the HTML.

All 64 pages share the chart's tagged fetch, so each crawl's `revalidateTag` (four a day) marks every one of them stale, and each regeneration writes the chart again. ADR-0019 priced these regenerations at about 250 KB, the brotli transfer size. ISR meters stored bytes, which are about twelve times larger.

The chart file is identical on every page. Storing it 64 times buys nothing the browser needs: the chart already paints only after hydration (ADR-0018), so the data arriving inside the HTML is not what makes the first paint fast.

## Decision

**The chart file is fetched by the browser from one route; the chart pages carry no chart data.**

- `/` and `/c/[code]` stop calling `fetchCharts`. With no tagged fetch they are plain static pages, rebuilt on deploy and never by a crawl. Their `revalidate` timers go too: there is nothing left for them to refresh.
- One GET route serves the whole `ChartFile`. It is statically generated and revalidated by the existing charts tag, so each crawl rewrites one artifact instead of 64 pages.
- An inline script in the page starts that read while the HTML is still parsing, so it runs beside the JavaScript download; `ChartScreen` takes over the same request once hydrated, and reads the file once per visit; every country is then in the browser, and a globe spin still paints with no round trip.
- The eager set is unchanged. Songs and playlist metadata stay eager, and playlist tracks and the deeper songs tail stay on demand (ADR-0016).

### Alternatives rejected

- **A cross-country summary per page, full chart per country on demand.** Each page would embed a few "seat" tracks per country (about 125 KB) and fetch a country's full chart when it is selected. Pages stay tagged, so all 64 still regenerate on every crawl, only smaller. A spin to a country not yet loaded waits on a round trip, which is the per-country split ADR-0016 rejected.
- **Each country page embeds its own country, the rest fetched.** Deep links paint a moment sooner, but the embed puts the tag back on every page and with it 64 regenerations per crawl.
- **Fewer crawls a day.** Divides the writes without removing the multiplier, and costs freshness (ADR-0002) to do it.

## Consequences

**Negative**

- The chart can now fail to load in the browser on its own. Until this change a missing chart failed the build or the render; now a page can arrive with no chart, and `ChartScreen` needs a state for it.
- The chart arrives on a second request. It starts with the HTML, so the sheet is late only when that download outlasts the JavaScript's. Spins are unaffected once it has loaded. The early start is an inline script, not a `<link rel="preload">`: with a preload, Chrome did not reuse it for the page's later fetch and downloaded the file twice.
- First-load transfer is unchanged. This decision moves the bytes, it does not shrink them; the metadata volume ADR-0016 named remains a first-load cost.
- Whether ISR stores a JSON route response compressed or raw is unmeasured, so the route's write cost is not priced here. The check is the dashboard's daily ISR Writes over the first days after deploy; the 30-day total drains too slowly to show it.

**Neutral**

- The build reads the store once, for the chart route, instead of once per page. A store outage still fails the build.
- The pages and the chart file can now be from different crawls for the length of one visit. The pages hold no chart data, so there is nothing for them to disagree on.
