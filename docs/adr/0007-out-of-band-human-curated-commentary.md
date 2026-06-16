# ADR-0007: Out-of-band human-curated commentary

**Status:** Accepted (2026-06-15). Trust model partially superseded by [ADR-0008](0008-risk-tiered-commentary-gate.md) (2026-06-16): the primary guard moves from a uniform human read-through to a risk-tiered code gate. The rest of this record (out-of-band generation, the Blob sidecar, the crawl contract, the significance trigger, the no-lyric lint) stands.

## Context

v1.2.0 adds a per-track song context card (#90): a short, grounded commentary on what a song is about and why it is charting. The architectural question is where that commentary is generated. The feed it attaches to is the scheduled crawl (`scripts/crawl/`), which fetches 40 countries' charts four times a day and serves them static from Vercel Blob.

The commentary makes factual, public claims about real songs, so accuracy and a hard no-lyric-reproduction rule (lyric text needs a paid publisher license) are non-negotiable. A comparable shipped feature, Toss Securities' market-signal explanations, is instructive: it runs under continuous human review, the operator reports spending more effort on verification than on building the generator, and a residual error rate persists even so. Human review is the load-bearing operation, not an add-on.

Options weighed for where commentary is generated:

- **In-crawl, automated:** the crawl generates each new track's commentary during its run and bakes it in. Rejected: it publishes unreviewed claims about real songs to a public surface with no human gate, the no-lyric rule would rest entirely on an unattended filter, and it adds recurring per-run cost and rate-limit exposure to a job whose runtime is already bounded.
- **Out-of-band, human-curated (chosen):** commentary is drafted and reviewed by a human editor between crawls and published to a store the crawl reads. Every entry passes a human gate before it goes live; the crawl stays a pure data feed.

## Decision

Commentary is generated out-of-band and human-reviewed, never by the crawl. The crawl reads a commentary store and bakes each entry into the served chart data, leaving tracks without an entry as `null` (no card) and never aborting on a miss, the same carry-forward contract it already uses for failed fetches.

- **Store:** a Vercel Blob sidecar, `commentary/v1/commentary.json`, keyed by `lang:normalized(artist|name)`. It is owned by the publish step; the crawl reads it but never writes it, a clean producer split from `charts.json` (which the crawl overwrites every run).
- **Selection:** a deterministic significance trigger (new entry, large rank jump, re-entry) from current versus carried-forward ranks decides which tracks warrant commentary. Effort goes only to tracks with a story; an entry, once written, persists and is reused after the track stabilizes.
- **No-lyric guard:** a deterministic lint hard-blocks publish on any entry resembling reproduced lyric text; the editor's read-through is the second layer. The guard runs at publish, not in the crawl.
- **Cadence:** commentary is filled in by re-running the publish flow, not on a schedule. A brand-new track shows no card until the next pass.

### Why out-of-band over in-crawl

Trust is the deciding axis. A public feature that asserts facts about real songs needs a human gate, and the reference above shows review, not generation, is where the work and the risk live. Keeping generation out of the crawl also holds the crawl within its runtime budget and makes commentary a separately cacheable concern with no per-run cost.

### Why a Blob sidecar over a repo-committed file

The data plane is already Vercel Blob: the crawl writes `charts.json` there and the app reads it, and nothing live lives in the repo. A committed data file would be the lone exception. The review a committed file would buy (a pull-request diff) is redundant on a single-maintainer project, where review is the publish lint plus the editor's read-through. The sidecar matches the existing architecture and keeps the producer split clean.

## Consequences

**Positive**

- Every published blurb is human-reviewed, the strongest guard against lyric leakage and inaccurate claims.
- The crawl stays a pure, LLM-free data feed with no new per-run cost or rate-limit surface.
- The significance trigger bounds effort to tracks that have a story.

**Negative**

- Coverage is manual: a new track has no card until the next publish pass, and the first backfill is a deliberate effort.
- There is no automatic regeneration; staleness on the "why charting" half is resolved by re-running a pass, not by a cron.

**Neutral**

- The sidecar adds one producer (the publish step) but no new infrastructure type; Blob is already in use.
- Language is a key dimension (`lang:…`), so per-language commentary is additive later without reshaping the store.
