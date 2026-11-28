# ADR-0026: A card says why a song is moving now, or there is no card

**Status:** Accepted (2026-11-26), not yet built: until it ships, the code follows ADR-0007 and ADR-0009, so check `main` before assuming any rule below. Amends [ADR-0007](0007-out-of-band-human-curated-commentary.md), whose cards persist and are never regenerated, whose significance trigger queues only movers, and whose drafting runs only by hand, and [ADR-0009](0009-fully-automated-commentary-gate.md), whose drafting lets a stable fact stand in when no source states a cause and whose grounding leaves the tag unread. The gate keeps ADR-0009's shape: binary checks on the whole card, and no human in the path. The owner set the top N and the expiry length on 2026-11-26 as estimates, not measurements, and the cadence waits on one measured run.

## Context

Almost no song carries a commentary card, and the few cards that exist say what a song is rather than why it is charting now. Counted on the live payload from the crawl of 2026-11-27 01:45 UTC, across the eager rows of all 65 countries:

- 3 of the 951 distinct tracks in the top 25s carry a card. All 3 are `what-it-is`, and all share one batch's timestamp, 2026-07-28 04:12 UTC, 121 days before this record.
- Their tags are frozen at July: one still reads "Spider-Man theme, opening week", another "No. 1 global debut".
- "Flower in a Hurricane" by Justice, the song from the GTA VI launch trailer of 2026-10-15, sits in 39 countries' top 25 and 34 countries' top 10 and has no card.

Five mechanisms produce that state before a card reaches the gate:

1. **The prompt prefers trivia.** `buildDraftPrompt` (`src/lib/drafting.ts`) tells the drafter to "Default to a stable, well-documented fact about the SONG ITSELF" and to give a reason the song is rising only when a source states one. A drafter that finds no cause writes a `what-it-is` card, which says what the song is and not why it charts.
2. **The timely field is unchecked.** The prompt calls the tag "a hook, not a verified claim", and grounding judges only the lead and detail (`gradeGrounding` in `src/lib/grounding.ts` joins those two). ADR-0009's 2026-07-10 amendment put the hook there on purpose. The one field that says "why now" is the one field no check reads, which is how a July tag still says "opening week" in November.
3. **The queue sees only movers, and never twice.** `computeWorklist` (`scripts/commentary/worklist.ts`) queues a track when its rank moves against the previous crawl or when it is a country's gem (ADR-0014), and skips any key that already has a card ("cache hit: never regenerate"). A song holding a top spot never queues, and a card is never redrafted, as ADR-0007 decided.
4. **The batch skips single-market tracks.** `scripts/commentary/draft-batch.ts` turns on `suppressLowConfidence`, so a track that is not a gem and charts in only one storefront or a same-region pair is never drafted. On the same crawl, 236 of the 382 distinct tracks in the 65 top 10s have that footprint and are not a gem.
5. **Drafting runs only by hand.** `pnpm commentary:draft` runs on a laptop, five tracks a batch by default (`scripts/commentary/draft-batch.ts`), and ADR-0007 set its cadence as "not on a schedule".

The Justice song shows the gate is not what blocks a strong card. [Billboard's cover story of 2026-11-23](https://www.billboard.com/music/features/gta-6-radio-songs-soundtrack-justice-billboard-cover-1236386805/) and [NME's report of 2026-10-15](https://www.nme.com/news/gaming-news/grand-theft-auto-6-soundtrack-justice-album-gta-rockstar-tame-impala-3973238) cover the song's place in the game, and both outlets are on the authority allowlist (`src/lib/source-authority.ts`), so a card citing them meets the source-authority rule. It never gets that far: the song holds its ranks, so it never queues.

## Decision

**A card states a reason the song is moving now that its sources state, or no card is shown.** Four rules carry it. The gate keeps ADR-0009's shape: code alone decides, every check is a binary pass on the whole card, and any doubt drops it. Grounding, one of those checks, now also reads the tag.

### Why-now or nothing

- **The drafter looks first for a cause a source states:** a soundtrack or sync placement, a release, an award, a holiday, a viral moment. Every new card is `why-charting`.
- **When no source states a cause, the draft returns no card.** It never falls back to a stable fact about the song.
- **A no-cause result is its own outcome, reported apart from a gate drop.** The drop ledger (`commentary/v1/drops.json`) records it under the track's key with its time, apart from the attempt count, so it never spends the attempts ADR-0009's 2026-06-23 amendment budgets. The worklist skips the key until the expiry length below has passed since that time.
- **A track that has spent its two gate attempts stays off every queue, the top N included.**
- **The tag is grounded with the lead and detail.** `CommentarySchema` requires a tag, so a tag the sources do not state drops the whole card, as any other ungrounded claim does. Leaving the tag out instead would make `tag` optional in `src/lib/chart-schema.ts`, a change to the published chart shape that this record does not make.

The reason is the card's job. ADR-0007 described a card as what a song is about and why it is charting; a stable fact answers only the first half, and preferring it produced the three trivia cards above. No card costs only coverage, which ADR-0009 already accepts as the price of failing closed. A no-cause result stays out of the attempt budget because press can report a cause after a song starts moving, which a permanent tombstone would never see, and it waits out the expiry length because retrying every run would spend quota on the same empty search. The record lives in the drop ledger because the worklist already reads it and the crawl never bakes it, so a record of a try never reaches the payload. A spent attempt budget still holds against the top N because a top-10 position does not change why the drafts failed the gate, and without the budget such a track would cost a draft every run. Grounding the tag closes the one field nothing checked, and dropping the card rather than stripping the tag keeps the gate entry-level, as ADR-0009's 2026-07-10 amendment chose.

### Expiry

- **A `why-charting` card stops being baked once it is older than the expiry length**, counted from its `generatedAt`. Its track can then be queued and redrafted; if no source still states a cause, it shows no card.
- **No `what-it-is` card is baked**, whatever its age.
- **Expiry deletes nothing; it only stops baking.** An expired card stays in the live store until a redraft of its key publishes. The live store holds one card per key, so that publish replaces the card there, and the run's backup of the whole store (`backupCommentary` in `scripts/commentary/upload-commentary.ts`) keeps the previous one.
- **A card dates its cause** ("the game's release on 2026-11-19") instead of saying "this week", since a card shows for up to the expiry length plus one crawl, and a relative time goes false before then.

The reason is that a claim about a moment goes stale when the moment passes, and nothing ends a card today: the live payload still shows "Spider-Man theme, opening week" 121 days after it was written. Expiring at bake time (`bakeCommentary` in `scripts/crawl/run.ts`) reads a field every card already has, so neither the store's shape nor `src/lib/chart-schema.ts` changes, and `what-it-is` stays a valid value for the cards already stored. The crawl runs four times a day (`.github/workflows/cron-crawl.yml`), so an expired card leaves the payload within one crawl. Deleting nothing keeps the rule reversible: until a redraft replaces it, a stored card shows or hides with the expiry length at no drafting cost, and a replaced card survives in the backup taken before every overwrite, since published commentary is never deleted from the object store in this repo.

### Queue

- **Every track in a country's top N with no bakeable card is queued, whether or not it moved and however few countries chart it,** unless its key is still inside a no-cause wait or has spent its two gate attempts (both above). A bakeable card is a `why-charting` card within its expiry; an expired card and a `what-it-is` card count as none.
- **The movement triggers and the gem trigger (ADR-0014) stay**, since they reach tracks below the top N.
- **The confidence filter is retired for every trigger.** `suppressLowConfidence` no longer keeps any track off the queue. `chartConfidence` stays only as the queue's order: tracks that chart across regions or in three or more countries draft first, since one card shows wherever its track charts.

The reason is that a stable chart never re-queues the songs people hear most. A track holding a top spot does not move, so no movement trigger fires for it, and "Flower in a Hurricane" sits in 34 top 10s with no card. Queuing by position puts drafting effort on the first rows of the chart a country opens on, and counting an expired card as none is what lets expiry redraft a card rather than only hide it.

The filter goes because a song popular in only one country is meaningful, and showing such songs is the app's premise. The filter dates from 2026-06-17 (`chartConfidence` in `scripts/commentary/worklist.ts`) and was turned on for drafting on 2026-06-19. It kept the drafter from spending effort on thin-market noise, and from inventing a reason for a position that has none. The case it was built for was an album deep cut at No. 1 in one storefront and in no other country, for which research found no local cause. Under why-now or nothing that case gets no card, and an invented cause fails grounding, so the gate now covers the risk the filter guarded. That holds for movers as much as for the top N, and keeping the filter for movers alone would make a track's eligibility depend on which trigger queued it rather than on what its sources state.

The cost is quota:

- **The first top-10 backlog is 382 drafts**, not the 146 the filter would leave.
- **A local track with no stated cause is retried every expiry length while it stays in a top 10.** The draw recurs until the track leaves, and its meter is no-cause results per run.
- **Single-market movers below the top 10 now queue too.** They were not counted here, since the movement triggers diff against the previous crawl's snapshot, which the public payload does not carry.

### Scheduled drafting

- **A GitHub Actions workflow of its own runs the existing `claude -p` drafter and judge, then publishes.** It is not a step in the crawl.
- **It authenticates with `CLAUDE_CODE_OAUTH_TOKEN`**, a token from `claude setup-token`, so a run spends the Claude plan's quota rather than a metered API key.
- **It starts only after the drafter and the queue follow the three rules above.**
- **Its first run is triggered by hand and measured:** plan quota per card, web searches, store writes and wall time. The owner sets the batch size and the cadence from that measurement, and only then does the workflow gain a schedule.
- **A run that publishes nothing reports differently from a run that failed.** Today an empty worklist exits 0, and a batch whose every selected track fails to draft exits 1 (`scripts/commentary/draft-batch.ts`). A no-cause result returns no draft, so if it is counted as a failed draft, as today's code would count it, a batch whose tracks all have no stated cause exits 1, and a schedule would report the normal result as a failure.
- **The owner adds the secrets:** the token, which lasts one year and then needs renewing, and a store write credential, scoped to the commentary prefix if the store supports it.

Each part has its reason:

- **Its own workflow,** because ADR-0007 kept generation out of the crawl to keep the crawl free of LLM calls and within its runtime budget (a 120-minute timeout over a run of about 55 minutes, measured 2026-07-22, per the comment in `cron-crawl.yml`). A separate workflow keeps both.
- **The plan token,** because the drafter and judge already run through `claude -p` (`scripts/commentary/draft.ts`, `scripts/commentary/ground.ts`), so the token changes where they run, not how. A metered key would put a dollar price on a volume nobody has measured. Both clients are injected (`DraftClient`, `GroundingClient`), so a metered key can replace the backend in one place if the plan stops fitting.
- **After the other rules,** because automation multiplies whatever the prompt produces, and the current prompt produces trivia.
- **Measured before scheduled,** because no one knows yet what a card costs in quota.

**The subscription-token caveat.** The documentation offers the token for scripts, and the terms leave the line between ordinary use and a product undrawn. Claude Code's Authentication page says to "generate a one-year OAuth token with `claude setup-token`" for "CI pipelines, scripts, or other environments where interactive browser login isn't available". Its Legal and compliance page, under "Authentication and credential use", says OAuth authentication "is designed to support ordinary use of Claude Code and other native Anthropic applications", and that developers "building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication". Under "Acceptable use", the same page says advertised plan limits "assume ordinary, individual usage of Claude Code and the Agent SDK". Neither page defines ordinary use (both read 2026-11-26). The owner's reading, recorded 2026-11-26: the job is the owner running Claude Code on their own plan on a schedule, and the site serves stored text, so no visitor's request ever reaches Claude; that makes it ordinary use of Claude Code, not a product that interacts with Claude's capabilities. The terms do not settle the question either way, and for products they name an API key. The measured run bounds how much of the plan a cadence takes, and the injected clients keep a metered key one change away.

## Numbers

The owner set both numbers on 2026-11-26. Both are estimates, not measurements, because each draws on a billed or metered resource whose cost per card is unmeasured. Each names the meter that would show it is wrong.

### Top N: 10

- **It reuses the worklist's existing line for the upper chart:** `DEFAULT_TOP_DEBUT_MAX` is 10 in `scripts/commentary/worklist.ts`.
- **It sizes the first backlog at 382 drafts.** On the crawl of 2026-11-27 01:45 UTC, the 65 top 10s hold 382 distinct tracks. A track keys once however many countries chart it, so 382 is the drafts a full backlog costs, each with one judge call: 77 runs at today's default batch of 5.
- **It starts at the top of the chart, because quota is unmeasured.** A top 5 holds 188 distinct tracks and a top 25 holds 951, so a top 10 keeps the backlog to two fifths of what covering every eager row would cost.
- **It keeps the Justice song in reach:** "Flower in a Hurricane" is in 34 of the 65 top 10s.
- **After the backlog, the top-10 rule queues only what changed:** tracks entering a top 10, cards past their expiry, and no-cause tracks due a retry. The movement and gem triggers add their own tracks below the top 10 on top of that, single-market movers now included.
- **Meters:** plan quota per run, no-cause results per run, and the share of baked top-10 rows with a card. If the top-10 part of the queue left after each run grows from run to run, N is too large for the cadence; growth from tracks below the top 10 points at the movement triggers instead, so the queue is read split by best rank against N, since a top-10 track that moved carries a movement reason. If no-cause results fill most of each run, the retries are spending quota on top-10 tracks whose sources state no cause. If the share stays near full while quota per run goes unused, N can grow.

### Expiry length: 14 days from `generatedAt`

- **It bounds the measured failure:** no claim stays in the payload more than one crawl past two weeks (crawls run four times a day), against 121 days today.
- **It keeps pace with a changing cause:** the Justice song's cause moved from the trailer (2026-10-15) to the game's release (2026-11-19) within 35 days, and a card first drafted with the trailer would have been redrafted twice in that span.
- **It is priced in plan quota, not store writes:** a publishing run writes the same three objects whatever its card count, so expiry sets only how often a top-10 track is drafted again, whether it holds a card or had no stated cause. That repeat draw is about 27 drafts a day (382 tracks over 14 days) if every one kept charting, and 7 days would double it to about 55. It is not a ceiling: first drafts come on top, for songs entering a top 10 and for tracks the movement and gem triggers add.
- **Meters:** plan quota per run, no-cause results per run, and the share of baked rows with a card. Redrafts and no-cause retries taking a large share of quota per run, or a steep fall in the share as cards reach their expiry, mean the length is too short. Too long has no meter of its own: it shows as a baked card whose dated cause the chart has moved past, found by reading the payload.

### Cadence: set from the measured run

No estimate is made here, because a card's cost in quota is unmeasured. What a run costs is countable from today's code:

- **Store writes per run:** a run that publishes writes three objects (the drop ledger, a backup copy of the store, the store), or two when the store was empty; a run that drafts but publishes nothing writes one, the drop ledger; a run with an empty worklist, or whose every draft fails, writes none (`scripts/commentary/draft-batch.ts`, `scripts/commentary/publish-store.ts`). Recording no-cause results in the drop ledger adds one write to a run whose drafts all end with no stated cause, where today's code writes none. Each publishing run also leaves one backup object that nothing deletes.
- **Plan quota per run:** one drafter call with web search per queued track and one judge call per draft, bounded by the batch limit (`--limit`, default 5).
- **Meters:** plan quota per run and store writes per run. The cadence is wrong if a day's runs take more of the plan than the owner allots, or if most runs publish nothing, spending writes and quota on an empty queue.

## Alternatives rejected

- **Keep the stable-fact fallback.** It is the current behavior, and it produced three trivia cards and no reason why.
- **A third tier for an observed movement with no stated cause.** The movement is the pipeline's own rank data, which no outlet publishes, so grounding cannot verify it; ADR-0009's 2026-07-10 amendment keeps rank claims out of cards for the same reason.
- **A chart body as the source for a movement claim.** A chart body corroborates a position, never a cause (`CHART_BODY_DOMAINS` in `src/lib/source-authority.ts`), and a position does not say why a song is charting.
- **Keep the confidence filter for the top-N queue.** It would keep 236 of the 382 top-10 tracks off the queue for their footprint alone, against the app's premise, and the risk it guarded is now the gate's.
- **Keep the confidence filter for movers only.** A track's eligibility would then depend on which trigger queued it, not on what its sources state.
- **Make `tag` optional and strip an ungrounded one.** It changes the published chart shape, and repairing a card field by field is what ADR-0009's 2026-07-10 amendment chose against.
- **Delete stale cards from the store.** It makes the rule irreversible, and expiring at bake time reaches the same payload.
- **Draft inside the crawl.** ADR-0007 rejected it partly for the crawl's bounded runtime and the per-run cost it would add, and both reasons still hold.
- **A metered API key from the start.** It prices every card in dollars before one run has been measured. It stays the fallback behind the injected clients.

## Consequences

**Positive**

- Every baked card states a sourced reason the song is moving now.
- A card ends: no claim stays in the payload more than one crawl past its expiry, and a song that keeps charting is redrafted from current sources unless it has spent its two gate attempts.
- The songs at the top of a chart become eligible for drafting, not only the ones that moved, outside a no-cause wait or a spent attempt budget; a song gets a card when its sources state a cause and the card passes the gate.
- A song popular in only one country is queued like any other top-10 track.
- Drafting runs without a laptop once a run is measured.

**Negative**

- Coverage falls before it rises. The bake rule removes all 3 live cards, since all are `what-it-is`, so the payload shows no card until a run publishes.
- A track whose sources state no cause never gets a card, however long it charts.
- The first backlog is 382 drafts, and every top-10 track with no stated cause is drafted again each expiry length while it stays there.
- Gems and other single-market tracks may still go cardless where the allowlist has no home-market outlet: 9 of the 10 drop-ledger entries read on 2026-11-05 failed `source-authority`. Widening the allowlist is the lever, and this record does not pull it.
- A top-10 track with two gate drops never gets a card, including a track dropped under the stable-fact prompt this record replaces. Clearing those ledger entries once the new prompt ships is the remedy, and this record does not require it.
- A tag the sources do not state now drops a card whose lead and detail passed.
- Expiry spends quota redrafting songs that keep charting.
- The schedule rests on terms that leave "ordinary, individual usage" undefined, and it stops when the one-year token expires unless the secret is renewed.

**Neutral**

- The gate keeps its shape: binary checks on the whole card, the same allowlist, no human. Only grounding's input grows, by the tag.
- `src/lib/chart-schema.ts` is unchanged. `what-it-is` stays valid for stored cards and for a hand-written one, which the gate still accepts and the bake ignores.
- The live store holds one card per key, so a redraft replaces the card it renews. Each publishing run adds a backup of the whole store first, and nothing deletes the backups.

## Revisit if

- The measured run shows a useful cadence takes more of the plan than the owner allots, or the plan limits the account: move the backend to a metered key.
- Anthropic defines "ordinary, individual usage" in a way that excludes an unattended schedule, or applies the products-and-services sentence to it.
- No-cause results still fill most of each run after the backlog drains: give a no-cause retry its own, longer interval than the expiry length.
- The share of baked rows with a card stays near zero after the backlog drains: the cause search or the allowlist, not this policy, is the next lever.
