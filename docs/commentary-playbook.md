# Commentary refinement playbook

How to write and publish the per-track context blurbs ("commentary") shown on the chart card. Commentary is curated out of band in human-reviewed passes, never by the crawl (see [ADR-0007](adr/0007-out-of-band-human-curated-commentary.md)). This is the runbook a pass follows.

## What commentary is

A short, grounded note about a charting track: what the song is about and why it is charting in that market. Structured, not a paragraph:

- `lead` (required): a one-line conclusion, the first thing a reader sees.
- `detail` (optional): a sentence or two of support, shown when the card expands.
- `tag` (optional): a short keyword, e.g. "new entry" or "viral".
- `sources` (required): the URLs the claims rest on.
- `generatedAt` (required): ISO timestamp of when the blurb was written.

It is never the song's lyrics. Commentary describes a song; it does not reproduce its words. Full-lyric display needs a publisher license we do not hold.

## Per-pass steps

1. **Get the worklist.** Run `pnpm commentary:todo`. It lists significant movers that have no blurb yet, deduped across countries, so a track is written once and reused everywhere it charts. The list is pre-filtered; work straight down it.
2. **Research each track** under the source policy below. Establish what the song is and why it is moving. If two credible sources do not support a "why it is charting" claim, keep the blurb to what the song is, or skip the track.
3. **Write the entry** in the style below, into a candidate file keyed by the worklist key (`pnpm commentary:todo --json` emits the keys).
4. **Read every blurb** before publishing: no reproduced lyrics, claims match the sources, no overstatement. This read-through is the real guard; the lint is only a backstop.
5. **Publish.** Run `pnpm commentary:publish <file>`. It hard-blocks on the schema and the no-lyric lint, backs up the live store, then uploads. A blocked publish uploads nothing.
6. **Spot-check** the card on the site.

## Source-authority policy

Ground every claim. A "why it is charting" claim needs at least two credible sources; below that, stay conservative or write nothing.

**Use:** official artist and label channels; established music press (Billboard, Pitchfork, Rolling Stone, NPR, The Guardian, and equivalents); Wikipedia where it cites primary sources; Genius for credits only. For a non-English track, prefer reputable sources from the track's own market.

**Avoid:** gossip aggregators, fan wikis, and lyric or SEO content farms. Never source a claim from a lyrics site.

## Writing style

Card copy follows the house writing principles, tuned for a fast read:

- **Lead with the point.** The `lead` states the conclusion, not a wind-up.
- **Plain and concise.** One lead sentence plus brief support; cut filler and hedges.
- **No em-dashes.** Use a colon, a semicolon, or a period.
- **No reproduced lyrics.** Do not wrap a long phrase or a lyric-like line in double quotes: the lint treats a long double-quoted run as a lyric signal and will block it. Refer to a title bare.

## The no-lyric guard

Publishing runs a deterministic lint that flags lyric-shaped content: long double-quoted runs, several short enjambed lines, and repeated lines. It is tuned to flag rather than miss, so it can flag a legitimate long quote or a list. When that happens, reword the copy or confirm it carries no lyrics and adjust. The lint cannot prove the absence of lyrics, which is why the read-through in step 4 is the load-bearing check.
