# ADR-0013: Bake per-track spread at crawl time, derive gem selection at read time

**Status:** Accepted (2026-07-03).

## Context

#175 wants to surface "gems": tracks that are charting widely across countries but easy to miss on any single country's list. The input signal is spread — how many of the 40 countries' charts contain a given track — and the open questions are where spread gets computed and how a track's identity is compared across countries that each ran their own independent crawl.

Cross-country identity needs a key that's stable regardless of which country's RSS feed produced the track. The raw Apple RSS response carries the song id as a plain field (`AppleRssTrack.id`), but `crawlCountry` currently drops it when building the public `Track` object; the same id is also recoverable by parsing the `i=` query param off `appleUrl`, which every observed RSS response carries.

## Decision

A post-loop pass, `bakeSpread`, runs once over the fully-built `countries` map after the per-country crawl loop and before the blob upload, mirroring `bakeCommentary` ([ADR-0007](0007-out-of-band-human-curated-commentary.md)). It counts, per cross-country key, how many countries' charts contain a track with that key, then writes that count onto every track sharing it as `spread`. The field is additive-optional on `TrackSchema`, so a blob predating this change still validates.

- **Cross-country key:** the Apple song id parsed from `appleUrl`'s `i=` param, falling back to normalized `artist|name` (mirroring `commentaryKey`) when no id is present. Chosen over carrying `AppleRssTrack.id` forward as a new `Track` field: the id is already recoverable from `appleUrl`, which is already public on every track, so parsing it needs no schema change and no edit to the already-tested `crawlCountry` build path. It also avoids adding a raw Apple-internal id as a permanent field on the public chart contract for a value that's redundant with data already there. The tradeoff is a soft dependency on Apple's RSS URLs continuing to carry `i=`; the artist+name fallback keeps that a degradation, not a failure.
- **Gem selection stays read-time.** This ADR bakes only the raw count. A future slice will derive "is this a gem" from the baked `spread` plus a track's rank, computed where the chart is rendered, not in the crawl. Spread is a stable per-track fact; what counts as a gem is a display judgment (a threshold, a comparison across the current spread distribution) that should be tunable without waiting for the next crawl to see the effect. Baking gem status would also mean re-deriving it from scratch every run regardless, since it depends on that run's own spread values, so there is no accuracy or cost argument for baking it too.

## Consequences

**Positive**

- `bakeSpread` is a pure, in-memory pass over data already assembled this run: no external calls, no new rate-limit surface, no addition to the crawl's runtime budget.
- The blob stays backward-compatible; old blobs without `spread` still parse.
- Gem selection can be redefined or tuned without a re-crawl, since it reads the already-baked `spread` at render time.

**Negative**

- The fallback key (normalized artist+name) can undercount a track whose metadata differs across countries' RSS feeds beyond what normalization folds away, or, rarely, overcount two distinct songs that happen to share an exact normalized artist+title.
- Spread reflects only the current run's charts; a track that dropped off every chart after resolving spread once won't retroactively update older cached reads until the next crawl.

**Neutral**

- Spread is recomputed from scratch every run, the same no-persisted-intermediate-state pattern the crawl already uses for the charts themselves.
