# Commentary refinement playbook

How to write and publish the per-track context blurbs ("commentary") shown on the chart card. Commentary is curated out of band in human-reviewed passes, never by the crawl (see [ADR-0007](adr/0007-out-of-band-human-curated-commentary.md)). This is the runbook a pass follows.

## What commentary is

A short, grounded note about a charting track: what the song is about and why it is charting in that market. Structured, not a paragraph:

- `lead` (required): a one-line conclusion, the first thing a reader sees.
- `detail` (optional): a sentence or two of support, shown when the card expands.
- `tag` (required): a short keyword; default to the worklist reason (new entry, rank jump, top debut), or a more specific one like "viral" when it fits.
- `claim` (required): which kind of claim the blurb makes, `what-it-is` or `why-charting`. See "Classifying the claim" below.
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

## Classifying the claim

Set `claim` to the blurb's risk tier, judged by its `lead`. The two tiers differ in how fast they go stale:

- `what-it-is`: a stable note about the song itself. What it is about, its genre or mood, the artist, how it was made. These claims hold whether the track is at rank 1 or rank 50, so they age slowly. Example lead: "A long-running chart favorite."
- `why-charting`: a time-sensitive note about the track's current chart movement. Why it entered, jumped, or went viral this week. These claims rest on a moment and go stale when the moment passes, so they carry higher risk. Example lead: "A new entry climbing fast this week."

Classify by what the lead asserts, not by the worklist reason. If a blurb makes both kinds of claim, take the higher-risk tier: a lead that explains why a song is moving is `why-charting` even when it also says what the song is about. When the "why it is charting" claim does not clear the two-source bar, fall back to a `what-it-is` blurb rather than guessing.

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

## The grounding check

The automated accuracy guard, added by [ADR-0008](adr/0008-risk-tiered-commentary-gate.md) and made the sole gate by [ADR-0009](adr/0009-fully-automated-commentary-gate.md): an LLM confirms that a blurb's cited sources actually state its claims, in place of a human's claim-to-source read. Both tiers run it; a blurb that fails is dropped (no card), never queued for a person.

**Threshold: the source must STATE the claim.** A claim is grounded only when a source explicitly states it. Being merely consistent with a source, or not contradicted by one, is not enough. The judge prompt encodes this threshold and asks for a three-way answer, `grounded`, `ungrounded`, or `uncertain`, so "I cannot tell" is a first-class verdict rather than a coin flip between pass and fail.

**Fail-closed.** Only a confident `grounded` lets a blurb through. `ungrounded`, `uncertain`, a malformed answer, and a judge error all resolve to not-grounded, which drops the card. A missed ungrounded claim auto-publishes a wrong public claim; a dropped card costs only coverage. The check errs toward the cheaper mistake.

**Scope.** It grounds the lead and optional detail against the cited sources, counting a claim as grounded when any one source states it. The `tag` is not grounded. On a partial fetch failure the judge reads whichever sources loaded: a claim whose only support was unreachable simply reads as ungrounded and drops. Only when every source is unreachable is the card dropped without judging.

**Backend.** The judge runs through the local Claude Code binary (`claude -p` with structured output), the only sanctioned way to spend the Claude subscription programmatically: the raw API rejects subscription OAuth and the consumer terms forbid reusing that token elsewhere. Each call carries a fixed harness cost billed against subscription quota, not dollars, so the check fits the current low-volume passes. A high-volume drafting pass would swap the backend for a metered API key, which touches only the injected client, not the verdict logic.
