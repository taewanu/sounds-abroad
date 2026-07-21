# Context

Domain glossary for Sounds Abroad. Each term has one project-specific meaning; the _Avoid_ line lists words that blur it. Use these terms as defined when naming concepts in issues, plans, tests, and reviews.

## Charts

**Chart**:
A ranked track list belonging to one country. A country carries a songs chart and one chart per local playlist; they are peers of one another, differing in where their tracks come from and in how many they carry, not in standing. See ADR-0017.
_Avoid_: using "chart" for the whole published payload (that is the charts file); treating the songs chart as the country's chart and the rest as something else.

**Songs chart**:
The 25-track chart of what a country is playing, drawn from the storefront's own ranking. Every country has exactly one, ranks mean the same thing across countries, and it is the chart a country opens on. Its tracks carry spread and may carry commentary.
_Avoid_: "top chart" or "main chart", both of which imply the playlist charts are subordinate.

**Playlist chart**:
A chart whose tracks come from one Apple storefront playlist that survived the crawl's locality filter. Meaningful in exactly one country, since a playlist appearing across many storefronts is excluded as global. Its tracks carry neither spread nor commentary, and it may run to a hundred tracks or more.
_Avoid_: calling it "a playlist" when the chart is meant. The playlist is the source, the chart is what a listener opens.

**Chart ref**:
What names a chart within a country: the songs sentinel, or a playlist id. Held as a flat string so it compares by identity in state, in effect dependencies, and in the URL without a serializer.
_Avoid_: using a country code alone to locate a track list, which held only while a country had one chart.

## Roadmap

The roadmap and release model, in one line: milestone-driven semver Versions, a single roadmap tracking issue as the source of truth, vertical-slice issues that each ship as one squash-merged PR, and annotated semver tags as the immutable record. See ADR-0005.

**Version (`vMAJOR.MINOR.PATCH`)**:
The unit of release and of planning. A Version is a themed batch of issues tracked as a GitHub milestone; when its issues are all merged into `main`, `package.json` is bumped, an annotated `vMAJOR.MINOR.PATCH` tag is cut at the release commit, and a GitHub Release with theme-grouped notes is published. The number follows the actual change, not a label: an additive batch bumps the minor (`v1.1.0`), a breaking change bumps the major (`v2.0.0`), and the patch digit stays unused outside genuine hotfixes because the app is continuously deployed. V1 shipped as `v1.0.0`; the pre-1.0 work (the Phases, below) ran under 0.x. A tag marks "everything merged up to the release commit is named vX.Y.Z", not a deploy event; the next tag sweeps up all commits merged since the previous tag.
_Avoid_: equating a Version with a single PR; reading the tag as the moment of deployment (deployment is continuous, the tag is a name); picking the number from an initiative label rather than the change type; letting `package.json` drift from the cut tag.

**Initiative (V1, V2, …)**:
An informal umbrella name for a major body of work, used to title its PRD (`[PRD] V2: …`). It is decoupled from the Version number: an Initiative is a scope and a "why", and it may ship across more than one Version (additive work under `v1.x`, a breaking redesign under `v2.0.0`). V1 = the first public launch, delivered across the pre-1.0 Phases and tagged `v1.0.0`.
_Avoid_: reserving an Initiative as a catch-all "someday" bucket (that is the `backlog` milestone); hard-binding "V2" to `v2.0.0`; numbering a milestone after the Initiative instead of the Version.

**Milestone**:
A GitHub milestone names a Version (`v1.1.0`, `v2.0.0`, …) or the permanent `backlog` (later/optional work, no due date). It holds the open issues planned for that Version; an open Version milestone with zero open issues means "ready to tag". Priorities and the dependency graph do not live here; they live in the roadmap tracking issue (#88).
_Avoid_: a milestone that tracks a Phase (the pre-1.0 model, where milestones named Phases instead of Versions; reversed in ADR-0005) or an Initiative; restating cross-issue priority inside milestone descriptions.

**Phase (`phase-1` … `phase-6`)**:
Frozen history. Phases were the pre-1.0 planning unit: themed bands of work, each closed with an annotated `phase-N` tag, that together composed the V1 launch (`phase-4` = the 3D globe; `phase-5` = globe-to-sheet integration plus launch polish). They are kept as tags for the development record and are not a forward-planning concept; new themed batches are Versions, tracked as version milestones. See ADR-0005 for why the model changed.
_Avoid_: opening a new Phase or `phase-N` tag; reading `phase-N` as anything but pre-1.0 history.
