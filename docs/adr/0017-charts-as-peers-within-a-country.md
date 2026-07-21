# ADR-0017: Charts are peers within a country, and only within one

**Status:** Accepted (2026-07-21). Governs how a country's charts relate to each other and to the country. [ADR-0015](0015-apple-storefront-playlists-as-chart-axis.md) established that a playlist is a chart; this decides what that makes the songs chart, and why a chart selection cannot cross a country boundary.

## Context

[ADR-0015](0015-apple-storefront-playlists-as-chart-axis.md) made each Apple storefront playlist a chart rather than an item, and [ADR-0016](0016-eager-songs-lazy-playlist-tracks.md) settled how their tracks reach the browser. Neither says what the songs chart becomes once it is no longer alone.

Two readings were available: a country keeps one answer with playlists as depth behind it, or a country becomes a set of charts of equal standing of which the songs chart is the default. The choice decides whether the axis is discoverable without a deliberate act, whether a chart is addressable, and whether a chart selection means anything after the country changes.

## Decision

**A country's charts are peers of one another. A chart selection is meaningful inside a country and nowhere else.**

**The songs chart is the default, not the parent.** Every chart is presented at equal standing, with the songs chart pinned first. It follows that a chart is addressable: if the songs chart is one of sixteen rather than the country's identity, the other fifteen must be reachable by the same means it is.

**A chart selection does not survive a country change.** A playlist id exists in exactly one country by construction, because the crawl's selection filter excludes playlists appearing across many storefronts: the axis selects for non-transferability. Genre offers no bridge either: sampled across distant countries, top-genre sets intersect only at the most generic entries, and the local genres that make the axis worth having are precisely the ones that do not transfer.

The asymmetry is the point, and it is why the country axis can support a fairness draw while the chart axis cannot. Countries are comparable: every one has a songs chart, and rank 1 means the same thing everywhere. Charts within a country are not comparable across countries.

### Alternatives rejected

- **Playlists as a drawer behind the songs chart.** Rejected because it makes the axis invisible until asked for, and because depth behind an affordance is not something you send someone a link to. The argument for it rested on playlist names being poor; measured across every published playlist, the median name is 18 characters and fewer than one in ten carries emoji. The country whose names prompted the concern is an outlier.

- **A genre lens instead of playlist names.** The most appealing option, and what the baked histogram was built for. Rejected on its own data: the top genre's share has a median of 70% and reaches 80% for only about a third of playlists, and a meaningful minority are artist sets whose genre says nothing their name does not. A lens that cannot cover its catalogue is worse than the names as published.

- **Matching a chart across a country change by genre.** Resolves to the generic genres or to nothing, which is a guess presented as a continuation.

## Consequences

The genre histogram stays baked and goes unread. [ADR-0013](0013-bake-track-spread-at-crawl-time.md) baked the whole distribution so the labelling rule could be tuned at read time; the rule turns out not to exist yet. It is cheap and already paid for, and removing it would foreclose a later one.

The songs chart keeps the gem hero and playlist charts have none, because gem selection ranks by per-track spread and playlist tracks carry none. Producing it means resolving every playlist track against every country during the crawl, which is a crawl cost decision rather than a presentation one.

A chart that fails to open is an ordinary outcome rather than a defect, since a country whose playlist axis was carried forward can advertise a chart the latest run never wrote.
