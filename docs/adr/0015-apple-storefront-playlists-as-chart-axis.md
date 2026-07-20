# ADR-0015: Apple storefront playlists become a second chart axis

**Status:** Accepted (2026-07-20). Extends [ADR-0013](0013-bake-track-spread-at-crawl-time.md)'s bake-count/derive-at-read pattern to a second axis. The payload and loading consequences are decided separately in [ADR-0016](0016-eager-songs-lazy-playlist-tracks.md).

## Context

The app serves exactly one chart per country: Apple's most-played songs for that storefront. [PRD #251](https://github.com/taewanu/sounds-abroad/issues/251) asks for per-country content that expresses what is distinctive about a place, and proposed Apple's per-storefront playlists as the answer.

The PRD reached that proposal under two beliefs that a 2026-07-20 probe refuted, and one measurement that inverted its stated reason.

**The free surface is now enumerated, not sampled.** Apple's own RSS generator drives its form from `/apple/music/{cc}/{kind}/feeds`, which answers authoritatively: `music` has four kinds (`songs`, `albums`, `music-videos`, `playlists`), each offers exactly one feed type (`most-played`), and every kind caps at a depth of 100. There is no unexplored free axis and no deeper feed. The PRD's "v2 offers only most-played" was correct; it is now established rather than assumed.

**A playlist's track list is reachable without payment.** The PRD treated the track list as strictly behind the $99/yr Apple Music API, because the RSS playlist feed carries no tracks and iTunes Lookup cannot resolve a `pl.` id. Both remain true, but the playlist's public web page embeds a `serialized-server-data` JSON block carrying the full track list: title, artist, album, duration, artwork, and the song's store id. Verified across US, Japanese, Nigerian, Turkish, and Brazilian storefronts, returning 75 to 200 tracks each. That store id resolves through the iTunes Lookup the crawl already runs, which returns both a preview URL and a genre.

**Playlists are not the most country-exclusive axis.** Measured across ten storefronts at depth 100, counting entries appearing in exactly one country: songs 94%, albums 86%, playlists 85%, music-videos 82%. The PRD rejected songs as "the same data any client can fetch, so it does not express what is distinctive about a place". That is false at depth 100, and the deeper ranks are the more exclusive ones. So the case for playlists cannot rest on distinctiveness of content, which is the reason the PRD gave.

## Decision

Adopt Apple storefront playlists as a second chart axis, because **each playlist is a chart, not an item on one**. The country view becomes a chart selector: the most-played songs chart, plus one chart per surviving local playlist. This multiplies the browsable charts per country rather than lengthening the single existing one, and it is the only surveyed axis that does so.

Two properties follow from that framing and neither is available on the alternatives:

- **A playlist carries a locally-authored name.** "Pagode 2026", "邦楽ヒッツ", "African Gospel" name the scene in the local vocabulary. A ranked list of song ids cannot say what kind of music a place has; a chart title can.
- **A playlist is already an editorial grouping.** Apple's local editors decided what belongs together, which is curation the crawl gets for free and could not synthesize from chart positions.

**Global copy-paste playlists are excluded by spread.** The same cross-country counting that powers the Local Gem applies unchanged: a playlist appearing in most storefronts is not that country's, and drops out. Following ADR-0013, the crawl bakes the raw counts and the selection threshold lives at read time, so it is tunable without a re-crawl.

**A playlist's genre is derived, not read.** The RSS feed's `genres` field is empty on every record sampled (500 across five storefronts), so the genre shown on a chart must be aggregated from its member tracks' `primaryGenreName` via Lookup. Passing `lang=en_us` normalizes the genre vocabulary to one language across all 63 storefronts while leaving track and artist names in their original script. Consistent with ADR-0013, the crawl bakes the full genre histogram and the displayed label is derived at read time, because the top genre's share of a playlist varies widely (measured 40% to 88%) and any labelling rule will need tuning.

### Alternatives rejected

- **`albums` and `music-videos`.** Both are free, per-country, and comparably exclusive, but each yields one more ranked list, not more charts. They do not answer the PRD's problem and can be added later on the same rails if a second list is ever wanted.
- **Deepening the songs axis instead.** Genuinely valuable and now known to be available, but it deepens the one chart rather than multiplying charts, and it inflates the eagerly-loaded payload that ADR-0016 exists to protect. Tracked separately.
- **The paid Apple Music API ($99/yr).** Two of the capabilities the PRD assigned to it, playlist track lists and genre-classified playlists, are reachable free. The remaining paid-only surface is not needed for this axis.
- **Discogs.** A different lens (historical and obscure, not current and local) on a different pipeline, scoped in [#254](https://github.com/taewanu/sounds-abroad/issues/254).

### The undocumented dependency, and the condition attached to it

`serialized-server-data` is Apple's internal page serialization. It is not documented, not versioned, and carries no compatibility promise. Depending on it is justified only alongside a way to notice when it breaks, because the failure is silent and simultaneous: a rename of that block fails every playlist in every country at once, while the songs axis stays healthy and reports the crawl as fine.

So the decision to depend on it is conditional on two mechanisms shipping with it:

- **Threshold detection in the crawl.** An individual playlist failing to parse is normal, since playlists are deleted and replaced. A large share failing together is a broken contract, and must fail loudly to Sentry rather than degrade quietly. The threshold itself is a tunable, so it lives in code, not here.
- **A contract test in CI.** A recorded fixture pins the block's shape so a refactor cannot silently loosen the parser. CI only runs when we change code, so this complements the runtime detection rather than replacing it.

## Consequences

**Positive**

- Charts per country go from one to roughly fifteen, with no new vendor, no credential, and no cost.
- Non-Western storefronts are well served: exclusive-playlist counts include Japan 68, India 58, Turkey 58, Brazil 53, Korea 42, Nigeria 27.
- Playlist tracks play in-app through the existing preview pipeline, so the new charts behave exactly like the existing one.
- Two of the arguments for paying $99/yr are withdrawn on evidence.

**Negative**

- The crawl gains its first dependency on an undocumented surface, mitigated but not removed by the two mechanisms above.
- Baking previews for every playlist track binds the number of playlists per country to the crawl's time budget. The budget, not editorial judgement, sets the ceiling today.
- Playlist selection now feeds back into what the crawl fetches, which the single-pass per-country loop cannot express. The crawl becomes two-phase: collect every storefront's playlist feed, compute spread, then fetch pages only for the playlists that survive. Fetching first and hiding later would download the same globally-repeated playlist once per storefront.
- Validity and carry-forward become per-axis, and within the playlist axis, per playlist. A country-level failure flag would translate a playlist-page failure into a rollback of that country's fresh songs chart, degrading the primary axis to protect the secondary one. Carrying a whole country's playlists over one failed page would be the same mistake a level down.

  Per-playlist is safe here only because selection reruns from the live feed every crawl. A playlist Apple deleted leaves the feed and is never selected, so anything whose page fails was listed today and exists; the failure is transient by construction and its track blob was never overwritten. Were selection sticky, the same rule would pin deleted playlists on the shelf indefinitely.

**Neutral**

- The measurements here come from a ten-country sample at a single point in time. Exclusivity rates are inflated relative to all 63 countries, though the comparison between axes is drawn from the same sample and stands.
- Nothing about the existing songs axis changes. This ADR adds an axis beside it.
