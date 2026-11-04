# Architecture Decision Records

Steering records describe how the code works today; read the ones in your area before changing it. Historical records describe code that is gone and stay only as context.

Add a row when you add an ADR. Move a record to Historical only once no running code depends on it: a superseded record stays in Steering until its replacement has fully shipped.

## Steering

| ADR                                                        | Area       | Decides                                                                                                                       |
| ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-toolchain-mise-pnpm-node-24.md)                | Toolchain  | mise, pnpm 10 and Node 24 LTS                                                                                                 |
| [0002](0002-public-repo-for-actions-budget.md)             | Toolchain  | A public repo, for the free Actions minutes the crawl needs                                                                   |
| [0003](0003-zustand-for-client-state.md)                   | Client     | Zustand for client state                                                                                                      |
| [0005](0005-semver-milestone-versions.md)                  | Process    | Milestones name semver versions, not phases                                                                                   |
| [0007](0007-out-of-band-human-curated-commentary.md)       | Commentary | Out-of-band commentary. Its trust model is replaced by 0008 and 0009; generation and the sidecar still hold                   |
| [0008](0008-risk-tiered-commentary-gate.md)                | Commentary | A risk-tiered gate with code as the primary guard                                                                             |
| [0009](0009-fully-automated-commentary-gate.md)            | Commentary | No human in the publish path                                                                                                  |
| [0010](0010-defer-quoted-span-lyric-judge.md)              | Commentary | Defer an LLM judge for the no-lyric lint; `quoted-span` still hard-drops                                                      |
| [0011](0011-globe-as-output-gesture-model.md)              | Globe      | Globe-as-output gestures. Superseded by 0020, but stays here while 0020 is unfinished because it still describes running code |
| [0012](0012-spotify-track-deeplink-resolution.md)          | Crawl      | Resolve Spotify track deeplinks at crawl time                                                                                 |
| [0013](0013-bake-track-spread-at-crawl-time.md)            | Crawl      | Bake per-track spread at crawl time, derive gem selection at read time                                                        |
| [0014](0014-gem-selection-triggers-commentary.md)          | Commentary | A country's gem triggers commentary regardless of rank movement                                                               |
| [0015](0015-apple-storefront-playlists-as-chart-axis.md)   | Crawl      | Apple storefront playlists as a second chart axis                                                                             |
| [0016](0016-eager-songs-lazy-playlist-tracks.md)           | Delivery   | Songs and playlist metadata stay eager; playlist tracks and the deeper songs tail load on demand                              |
| [0017](0017-charts-as-peers-within-a-country.md)           | Client     | Charts are peers within a country, and only within one                                                                        |
| [0018](0018-static-home-with-client-side-landing-roll.md)  | Delivery   | A static home route with a client-side landing roll                                                                           |
| [0019](0019-path-segment-country-urls.md)                  | Delivery   | Path-segment country URLs (`/c/<code>`)                                                                                       |
| [0020](0020-drag-to-select-globe-interaction.md)           | Globe      | Drag-to-select. Accepted but only partly shipped, so check `main` before assuming any part of it                              |
| [0021](0021-chart-file-fetched-apart-from-pages.md)        | Delivery   | The browser fetches the chart file from one route; pages carry no chart data                                                  |
| [0022](0022-bare-audio-element-without-web-audio-graph.md) | Client     | Play the bare audio element, with no Web Audio graph                                                                          |

## Historical

| ADR                                                         | Was                                  | Replaced by |
| ----------------------------------------------------------- | ------------------------------------ | ----------- |
| [0004](0004-dynamic-home-route-for-server-painted-chart.md) | A dynamically rendered home route    | 0018        |
| [0006](0006-web-audio-graph-for-volume.md)                  | A Web Audio graph for volume control | 0022        |
