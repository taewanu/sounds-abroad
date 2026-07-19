# ADR-0014: A country's gem triggers commentary regardless of rank movement, and bypasses the confidence penalty

**Status:** Accepted (2026-07-06); amended 2026-07-19 (#251). Extends [ADR-0007](0007-out-of-band-human-curated-commentary.md)'s significance trigger and its confidence gate; neither is replaced.

## Context

[#175](https://github.com/taewanu/sounds-abroad/issues/175) added the Local Gem card (labelled "today's gem" until the 2026-07-19 amendment below): on every country landing, `selectGem` (from [#180](https://github.com/taewanu/sounds-abroad/issues/180)) surfaces the one track that's distinctly local, meaning low `spread` ([ADR-0013](0013-bake-track-spread-at-crawl-time.md)) and so barely charted anywhere else. The card is built to reuse the existing commentary panel, so the natural expectation is that a gem usually has a "why it's trending here" blurb to show.

In practice it often doesn't. The commentary worklist (`scripts/commentary/worklist.ts`) only queues a track when its rank moves significantly (`new-entry`, `rank-jump`, `top-debut`) against the prior crawl. A track holding a stable rank never re-triggers, no matter how prominent. Separately, `chartConfidence` treats a track's charting footprint as `"low"` (a "thin-market quirk, not a real story") when it's confined to one storefront or a same-region pair, and low-confidence items sort to the back of the queue (or drop entirely, under `suppressLowConfidence`).

These two mechanisms collide with gem selection rather than complementing it. A gem is, by construction, a low-spread track, usually confined to one or two markets. That is exactly the footprint `chartConfidence` calls thin. And a genuinely strong local hit is often stable at the top of its chart rather than freshly moving, which is exactly what the significance trigger ignores. Confirmed live: `REDRED` by 코르티스 was rank 1 in South Korea, selected as Korea's gem, and had no commentary: it never re-entered the worklist (no recent movement), and its single-market footprint would have sorted it toward the back even if it had.

## Decision

A track selected as some country's gem (`WorklistReason: "local-gem"`) queues for commentary even with no rank movement, and is exempt from the confidence-based penalty: it neither gets suppressed by `suppressLowConfidence` nor sorted behind confident items. Being selected as a gem is itself independent evidence of a real local story (a `spread`-based cross-country comparison, not a same-tier proxy like `chartConfidence`'s regional-adjacency heuristic), so the thin-footprint signal that would otherwise read as noise reads as the point instead.

This bypass applies only to gems in the `"entirely their own"` or `"a local favorite"` tier. The `"their most local pick today"` fallback tier, `selectGem`'s answer when a market has no genuinely local track at all, carries the same thin evidence `chartConfidence` already distrusts, so it does not bypass the gate. A weak-evidence gem is still worth showing in the UI (the card must never be empty), but it isn't worth spending generation and human-review effort proving a story that the selection function itself flagged as its last resort.

A real movement reason still takes precedence when both apply. It's the more specific, tellable story; `"local-gem"` is a fallback for when no movement reason exists, not an override of one.

## Consequences

**Positive**

- A country's most emblematic track is much more likely to have an explanation on the card that's built specifically to invite the question "why is this trending here?"
- The bypass is scoped to gems with real spread evidence, so it doesn't undo `chartConfidence`'s original purpose (filtering out actually-thin, uninteresting chart positions) for tracks that merely happen to sit in a data-thin market with no compelling gem candidate.

**Negative**

- Adds up to one new worklist candidate per country per crawl (bounded by 63, less in practice since most countries' gems stabilize and already have commentary), a modest addition to the out-of-band generation and human-review load ([ADR-0008](0008-risk-tiered-commentary-gate.md)).

**Neutral**

- The significance trigger and `chartConfidence` are unchanged for every non-gem track; this is an additional trigger and a narrow, evidenced exemption, not a redesign of either mechanism.

## Amendment (2026-07-19, #251): "gem" here means the Local Gem, not the planned Hidden Gem

Everything above governs the **Local Gem**, and only it. [PRD #251](https://github.com/taewanu/sounds-abroad/issues/251) splits the name across two surfaces:

- **Local Gem** (this ADR): on the chart here, low global spread. Apple-sourced, all 63 countries, shipped.
- **Hidden Gem** (not yet built): off any chart, obscure vintage archive. Discogs-sourced, collector-scene countries only, a separate pipeline.

Neither the trigger nor the confidence bypass decided above transfers to a Hidden Gem. Both read a chart position, and a Hidden Gem has none, so whatever queues one for commentary needs its own decision in its own ADR.

The card was labelled "today's gem" until this amendment, which named its refresh cadence instead of what makes the track worth surfacing: every track on the same chart is equally today's, and only this one is low-spread. "Hidden" was wrong for the opposite reason, since a track charting high in its own market is not hidden where it lives.

Only the label changed. `WorklistReason: "local-gem"` already carried the name, and `selectGem`, `GemTier`, and the tier strings keep theirs, with bare `gem` as the umbrella over both kinds.
