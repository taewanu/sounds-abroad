# ADR-0016: Songs stay eager, playlist tracks load on demand

**Status:** Accepted (2026-07-20). Governs how chart data reaches the browser, independent of where that data comes from. [ADR-0015](0015-apple-storefront-playlists-as-chart-axis.md) is what forced the question, but this decision outlives any particular source and applies to axes added later.

## Context

Every visitor downloads every country's chart on first load. `page.tsx` fetches the whole chart blob server-side and passes it as a prop to `ChartScreen`, which is a client component, so the entire `ChartFile` is serialized into the RSC payload and shipped to the browser.

That was free at the current size and deliberate. The globe's core interaction is that spinning to any country paints its chart instantly ([ADR-0011](0011-globe-as-output-gesture-model.md)), and instant means the data is already there. Measured live: 1.22 MB, 63 countries, 1,575 tracks, roughly 812 bytes per track.

[ADR-0015](0015-apple-storefront-playlists-as-chart-axis.md) makes each playlist its own chart, at a measured mean of 106 tracks each and fifteen playlists per country. Carried the same way, that is tens of megabytes on first load. The existing approach does not survive a second axis, so the question is not whether to split the payload but along which seam.

The seam matters because splitting has a cost the current design was buying its way out of. Any data that is not already in the browser needs a network round trip at the moment it is wanted, and where that moment falls decides whether the split is felt as latency or not felt at all.

## Decision

**Eager is reserved for what must be instant. Everything else hangs off an explicit user action.**

Concretely:

- **`charts.json` keeps the songs chart, and gains playlist metadata:** each playlist's id, name, artwork, genre histogram, and spread. This is what the chart selector needs to render, so a country's full list of available charts appears with no fetch. Measured at 592 bytes per playlist on disk, against 812 for a single track, and roughly 66 bytes once compressed.
- **Each playlist's track list becomes its own blob,** keyed by playlist id, fetched when the user switches to that chart.

The seam is drawn at the chart switch because that is a deliberate act. A user who picks "Pagode 2026" from a list has asked for something and will accept a moment of loading. Spinning the globe is not that: it is exploratory, continuous, and the whole point is that it answers immediately.

Keying the blobs by playlist rather than by country also deduplicates. A playlist that survives the spread filter in three storefronts is stored once and cached once, which a country-keyed split cannot do.

### Alternatives rejected

- **Split per country.** The obvious seam, and the wrong one. It puts a network round trip inside the globe spin, which is the one interaction the architecture exists to keep instant. It also stores a shared playlist once per country that carries it.
- **Split everything, including songs.** Pays the latency cost on the default view that every visitor sees, to save a payload that is already acceptable. The songs chart is what the globe paints; it has to be there.
- **Keep the single blob and cap the playlist count to fit.** The cap that fits is small enough that the axis stops being a chart selector and goes back to being a handful of extras, which is the thing [ADR-0015](0015-apple-storefront-playlists-as-chart-axis.md) decided against.

## Consequences

**Positive**

- The globe keeps its defining property. Country switching still needs no round trip, and the track lists that would have made first load unusable never enter it.
- The chart selector renders instantly from metadata, so browsing what is available costs nothing; only committing to a chart costs a fetch.
- Playlists shared across storefronts are stored and cached once.
- The seam generalizes. A later axis inherits the rule (is it needed instantly, or does a user action precede it?) without reopening this decision. [#254](https://github.com/taewanu/sounds-abroad/issues/254)'s hidden gem is the next case.

**Negative**

- The eagerly-loaded payload grows. Measured against the live blob, 945 playlists of metadata take first load from **122 KB to 184 KB over the wire**, and parse cost from 2.0ms to 3.6ms. The seam moves the track lists out, which is what makes the axis possible at all, but it does not leave first load untouched. The metadata volume scales with the per-country cap, so that cap is a first-load decision as well as a crawl-budget one.

  On disk the same change reads 1.22 MB to 2.09 MB, a 44% jump, which is the number to quote nowhere: the blob is served compressed and that is not what anyone downloads. The compressed increase is larger in proportion than the raw one, because playlist names, URLs, and artwork hashes are all distinct while the existing track data is highly repetitive. Compression ratios do not carry across payloads of different shape.

- Opening a playlist chart can fail on its own, which the app has not had to handle before: a chart offered in the selector may not load. The metadata promising a chart and the blob delivering it are now two publishes that can disagree.
- The crawl publishes many blobs instead of one, so "the charts were published" stops being a single atomic fact. A partial publish leaves the selector advertising charts whose blobs are missing.
- Blob storage grows from one object to roughly a thousand, with their own lifecycle: a playlist that drops off every storefront leaves an orphan.

**Neutral**

- The existing `charts-prev.json` snapshot and the rank-movement diff built on it ([ADR-0007](0007-out-of-band-human-curated-commentary.md)) concern the songs axis, which is unchanged here.
- Per-track payload stays as it is. This decision is about what travels together and when, not about making tracks smaller.

## Amendment (2026-07-21): writes went uncounted

The Consequences priced the split on read-side terms (first-load KB, parse ms) and named the atomicity and orphan costs, but never counted that one blob per playlist is one write per crawl. Object stores meter writes far more tightly than reads, and the free tier's write cap is what the axis exhausted, taking production down ([#268](https://github.com/taewanu/sounds-abroad/issues/268)).

The split stands; the writes are what changed. [#269](https://github.com/taewanu/sounds-abroad/issues/269) withholds the per-playlist blobs until [#260](https://github.com/taewanu/sounds-abroad/issues/260) gives them a reader, and points at change-only publishing (measured churn: ~3 of 615 a run) as the durable shape, since rewriting every blob every run is the most expensive one available.
