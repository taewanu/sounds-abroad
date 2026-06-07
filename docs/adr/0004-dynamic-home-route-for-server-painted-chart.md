# ADR-0004: Dynamic rendering of the home route for a server-painted chart

**Status:** Accepted (2026-06-07)

## Context

The home route `/` renders a per-country chart sheet (the track list). Until now it was statically prerendered, but the sheet was client-rendered: `ChartScreen` reads the selected country from the URL via `useSearchParams()`, which renders its Suspense subtree as the server `null` fallback, so the chart was absent from the initial HTML. The LCP element was therefore the client-rendered chart, painting only after hydration. Deferring the globe (#69 / PR #73) did not measurably move the chart's LCP in a controlled re-measurement, consistent with the LCP element being the client-rendered chart rather than the globe. #74 carries that gate.

To put the chart in the initial HTML the server must know which country to render. The country comes from `?cc=xx` for direct and shared links, and from a random pick for the bare `/` landing, which is the primary entry and the path Lighthouse measures. Reading `searchParams` is a dynamic API, and a request-time random pick is non-deterministic, so the route cannot be prerendered as a single static file.

Options weighed:

- **Keep the chart client-rendered** - leaves LCP on a post-hydration element. Rejected; it is the problem being fixed.
- **Static per-country routes** (`/c/[cc]` + `generateStaticParams`) with an edge-middleware random rewrite for bare `/` - makes the 40 direct-link pages CDN-static, but changes the URL scheme (`?cc=` is already shipped in the player deeplink and assumed by the planned per-country OG cards), adds middleware, and bare `/` still needs a request-time function for the random pick. The static benefit is marginal because the chart data is already cached (`force-cache` + tag). Deferred as a V2 scaling option.
- **Server redirect bare `/` to `/?cc=xx`** - adds a round-trip before the real render, working directly against the LCP goal on the main path. Rejected.

## Decision

Render the home route dynamically and keep the chart reading the country from the URL on the client, with a server-resolved fallback for the bare landing.

- `page.tsx` forces dynamic rendering with `await connection()`. This excludes the route from prerendering, so `useSearchParams()` is available during the initial server render instead of bailing out to a client-rendered Suspense fallback (the bailout is a static-prerender behavior only).
- `page.tsx` picks a random `defaultCountryCode` server-side; it is the fallback the chart uses for bare `/` and any invalid `?cc=`. `page.tsx` does not read `searchParams` itself: the chart reads a valid `?cc=` through `useSearchParams`, so resolving it server-side would be redundant work whose result the chart never reads. The chart data is already cached, so the only per-request work is rendering the sheet HTML (no external I/O). It passes `defaultCountryCode` to `ChartScreen` as a prop and drops the `<Suspense>` wrapper.
- `ChartScreen` stays a Client Component and reads the country from `useSearchParams().get('cc')`, falling back to the `defaultCountryCode` prop. On the dynamic route this server-renders the sheet into the initial HTML; because the country stays client-readable, a pin click writes the new code with `window.history.pushState` (no navigation) and the chart re-renders from the `useSearchParams` update in place, with no server round-trip.
- The globe (`globe-scene`, client-only via `next/dynamic` `ssr:false`) keeps reading the country from `useSearchParams()`. Chart and globe both read the country from the URL, which stays the single source of truth.
- For bare `/`, the client writes the chosen country into the URL with `window.history.replaceState` after hydration, so the URL becomes shareable and the globe can read it.
- The chart sheet (a Radix Dialog) renders **without** `Dialog.Portal`. A React portal renders nothing during server rendering (it needs a live DOM node), so a portaled sheet would stay out of the initial HTML even on a dynamic route. This was a second, independent cause of the missing chart, found only after the `useSearchParams` bailout was fixed. Rendering in place is safe here: the sheet is a fixed overlay declared after the globe layer, with no clipping or transformed ancestor, and `modal={false}` was already set so no focus trap is lost.

### Why keep `useSearchParams` (hybrid) over a server prop only

An alternative resolves the country entirely on the server and passes it to `ChartScreen` as its only source, dropping `useSearchParams` from the chart. It is simpler (one country input) and also server-renders the chart, but it was rejected because country switches would regress. Switches write the new code with `window.history.pushState` (no navigation; Next syncs it with `useSearchParams`), so the chart re-renders client-side instantly. If the chart's country came only from a server prop, a switch would instead need a router navigation and an RSC round-trip on the now-dynamic, non-prefetched route before the new chart paints. Keeping `useSearchParams` preserves the instant switch while the forced-dynamic route still server-renders the initial chart, so the hybrid meets the LCP gate without trading away switch latency. The cost is two country inputs in `ChartScreen` (the hook plus the fallback prop).

That `useSearchParams` server-renders on a dynamically rendered route, and only there, is documented in Next.js 16 and confirmed empirically: a `curl` of a `connection()`-forced spike route returned the search-param value in the initial HTML.

### Why pure random for bare `/` (no visited dedup)

`visited` (localStorage) existed solely to make the bare `/` landing avoid repeating a recently seen country. The server cannot read localStorage, so preserving that no-repeat guarantee would require moving `visited` to a cookie. For V1 a pure server-side random pick is chosen: it keeps the per-visit variety, drops only the no-repeat guarantee (noticeable only on a manual refresh of bare `/`, since the random pick happens only on that load), and lets `visited-storage` and the `pickUnvisited` dedup logic be deleted. Cookie-based dedup is a V2 candidate.

### Why `replaceState` over `router.replace`

`router.replace` is a navigation: it re-runs the server component and refetches the payload, which would re-render the chart (a flicker) and add latency. `window.history.replaceState` only relabels the URL, with no navigation and no re-render. Next.js 16 documents that `pushState` / `replaceState` integrate with the Router and stay in sync with `useSearchParams` (Native History API), so the deferred globe reads the country on mount, after the URL is set and before it is visible. No redirect round-trip, no flicker.

## Consequences

**Positive**

- The chart is in the initial HTML, so LCP can land on a server-painted element (the #74 gate).
- No URL scheme change; the shipped player deeplink and the planned per-country OG cards keep working on `?cc=`.
- Deletes `visited-storage` and the dedup logic: less code, one fewer concept.

**Negative**

- The home route is now dynamic: a function invocation per request instead of a CDN-served static file. Cheap here (data is cached, render is HTML-only) and negligible at launch traffic, but a real meter at scale.
- Loses the "no repeat country until all are seen" guarantee on bare `/`. V1 tradeoff; cookie dedup deferred to V2.
- The de-portaled sheet is coupled to the current layout: it assumes no `overflow`/`transform` ancestor clips or re-stacks a fixed child. Restore `Dialog.Portal` if that assumption breaks.

**Neutral**

- The `/c/[cc]` static restructure stays available as a V2 scaling option if function cost or CDN caching of direct links becomes material.
- Relies on two Next.js 16 behaviors, both documented and confirmed against an empirical build (installed version 16.2.4): the Native History API integration (`replaceState` syncs `useSearchParams`), and dynamic-route server rendering of `useSearchParams`.
- `ChartScreen` now has two country inputs (the `useSearchParams` hook and the `defaultCountryCode` fallback prop) rather than one. Accepted as the cost of keeping pin-click switches instant; see the hybrid rationale above.
- A shared client store (ADR-0003, Zustand) was considered as an alternative country channel for the globe, but the URL already serves that role, so no new store is introduced.
- The hard `LCP <= 2.5s` gate (#69) was re-scoped (2026-06-07) to FCP / CLS / TBT + a content-visible check; LCP and TTI are measurement artifacts for this WebGL + custom-font page (the chart paints ~1.5s, but LCP records a later font-swap repaint). See #69.
