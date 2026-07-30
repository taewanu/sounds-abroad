# ADR-0019: Path-segment country URLs

**Status:** Accepted (2026-07-24). Amends ADR-0011 (the `?cc=` write contract)
and ADR-0018 (which deferred this restructure to "OG cards only"). The blanket
`replaceState` restated below went stale the same day, when a gesture landing
began pushing instead. ADR-0020 (2026-07-30) revises it for the
country-selection writers. The path-segment spelling stands.

## Context

ADR-0018 made the home route static, which forced its metadata generic: a
static page cannot vary `<meta>` tags by query string, because share crawlers
read the served HTML and never run JS. The per-country share cards ADR-0004 had
promised on `?cc=` (issue #309) therefore need per-country _documents_, and the
only cost-compatible way to get them is to prerender one document per country.

`?cc=` was never load-bearing for the server after ADR-0018 (the client
resolves it), but it was the shipped URL scheme, named by ADR-0011 as the
single write channel for country selection.

## Decision

Countries become path segments: `/c/[code]`, 63 pages prerendered via
`generateStaticParams`, each with its own title, description, and `/og?cc=`
images. `dynamicParams = false`: an unknown or wrong-case code is a CDN 404,
never a render.

- **The write contract moves with it.** Every client writer ADR-0011
  enumerated (globe settle, country selector, shuffle, chart rail) now writes
  `/c/<code>` (plus `?chart=` for a playlist) via `replaceState`. The URL stays
  the single source of truth; only its spelling changed. ChartScreen resolves
  the country as `?cc=` query → path segment → client landing roll.
- **No redirect for legacy `?cc=` links.** A `/?cc=xx` arrival still lands on
  the right country: the query outranks the path in the client resolver, and
  the canonical writer relabels to `/c/xx` after hydration. A routing-layer
  redirect was built and rejected: a permanent 308 is browser-cached past any
  future scheme change, Next re-appends the consumed query to the destination
  (`/c/kr?cc=kr`), the matcher is case-sensitive where the old client was not,
  and the site's traffic history says approximately no legacy links exist.
  Cost of keeping the fallback client-side: old links show the generic OG card.
- **The fallback timer is priced per route.** The hourly `revalidate` that is a
  safety net on one home page multiplies into a fleet here: 64 routes × hourly
  × ~250KB is ~11.5GB/month worst case, above the cap that caused the
  ADR-0018 incident. Country pages therefore revalidate daily; freshness comes
  from the crawl's `revalidateTag`, which expires all 64 pages at once because
  they share one tagged fetch. Worst case with the daily timer: ~0.7GB/month.

## Consequences

**Positive**

- Per-country share cards return, on static pages: the ADR-0004 feature at
  ADR-0018 cost.
- A country page is a plain document URL: linkable, prerendered, CDN-served.

**Negative**

- Two URL spellings exist in the wild until legacy `?cc=` links age out; the
  legacy form keeps working but shares with the generic card.
- 63 more pages regenerate after every crawl; each regeneration re-downloads
  the >2MB charts payload the data cache cannot hold (#310 grows 64×).

**Neutral**

- `/` keeps its hourly safety net and its role as the random-landing entry;
  after the client roll it relabels to `/c/<code>`, so the address bar is
  always shareable.
- The sitemap still lists only `/`; per-country indexing remains a separate
  SEO decision.
- A trailing-slash arrival (`/c/br/`) resolves the country but fails the
  canonical check, so the client relabels it once to `/c/br`.
