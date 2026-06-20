# ADR-0010: Defer an LLM judge for the no-lyric lint's quoted-span rule

**Status:** Accepted (2026-06-20). Records a decision to DEFER a proposed change to [ADR-0007](0007-out-of-band-human-curated-commentary.md)'s no-lyric lint. The lint is unchanged; `quoted-span` still hard-drops.

## Context

The no-lyric lint (ADR-0007) backstops against reproducing lyrics, carried into the automated gate (ADR-0009). Its `quoted-span` rule hard-drops any double-quoted run longer than six words as reproduced lyric. The rule keys on punctuation and length, not meaning, so it cannot tell a reproduced lyric line from a long title. Under the human read-through ADR-0007 assumed, a false positive cost the editor one glance; ADR-0009 removed the human, so the same false positive silently drops a card.

The first bulk-draft pass hit this once: a blurb on a single charting in over thirty countries was dropped because its lead quoted a ten-word album title. A fix was designed: turn `quoted-span` into a trigger that calls a cheap-tier LLM title-versus-lyric judge (tri-state, fail-safe like the grounding check), while the structural rules (`verse-lines`, `repeated-line`) stay a deterministic floor.

## Decision

Do not build the judge now. Keep `quoted-span` as a deterministic hard-drop. Instead, add drop-reason detail (the failing sub-rule and the excerpt) to the publish route, so a batch's no-lyric drops self-classify: a `quoted-span` on a long title reads as a false positive, a verse-shaped run as a real catch. Revisit the judge only if that logging shows `quoted-span` false positives are common.

### Why defer (measure-first)

The trigger was one card. The next twenty-item batch fired the no-lyric lint zero times; across twenty-five gated drafts the `quoted-span` false-positive rate is about one. Building an LLM judge to fix a roughly four-percent event is premature, and it is not free: it adds prompt surface, a second "an LLM checking an LLM" call, and correlated-error risk with the drafter (same model family may reproduce a lyric and then wave it through). The cost of the false positive today is one dropped card, which the carry-forward contract (ADR-0007) already renders as no card, never a wrong public claim. Instrument first; build only if the data turns.

### Why the judge is the right shape if revisited

Title-versus-lyric is a semantic distinction, and length cannot draw it: a quoted lyric hook and a long title can both exceed six words. A deterministic cue-word carve-out (skip a span after "album" or "single") is brittle against titles with no cue word and non-English titles. ADR-0009 already accepts an LLM judge for the analogous "does the source state this claim" question, so the pattern fits. The deferred design, for the record: `quoted-span` triggers the judge; only a confident "title" clears the span; "lyric", "uncertain", and malformed verdicts drop; it runs on a cheaper tier than grounding; the structural rules remain a model-independent floor.

## Consequences

**Positive**

- No new LLM surface or cost now, and the `quoted-span` backstop stays strict.
- The enriched drop-log turns any future revisit into a data decision, not a guess.

**Negative**

- The known false positive persists: a blurb that quotes a long title in double quotes still drops until the drafter avoids that shape or the judge is built. The meantime lever is drafting (do not quote long titles), not loosening the lint.

**Neutral**

- ADR-0007's lint and ADR-0009's gate are untouched. This is the first ADR here that defers a change rather than adopting one.
