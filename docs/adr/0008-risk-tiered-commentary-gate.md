# ADR-0008: Risk-tiered commentary gate, code as the primary guard

**Status:** Accepted (2026-06-16)

Supersedes the trust model of [ADR-0007](0007-out-of-band-human-curated-commentary.md). The rest of ADR-0007 (out-of-band generation, the Blob sidecar, the crawl read-and-bake contract, the significance trigger, the no-lyric lint) stands unchanged.

## Context

ADR-0007 made the human read-through the load-bearing guard for commentary: a person reads every blurb before publish, and the deterministic checks (schema, no-lyric lint) are a backstop. v1.2.0 then moved the goal toward automation. Slice C (#101) made the `tag` field schema-required, motivated by treating commentary as an automated pipeline where per-blurb human review cannot be relied on. The two premises diverge: "human review is load-bearing" against "the pipeline cannot lean on per-entry human review."

Inspecting the guards in code sharpens the conflict. They defend two different risk axes, and the axes are not equally covered:

- **No-lyric reproduction:** has a deterministic backstop (`no-lyric-lint.ts`), weak but present. The playbook itself notes the lint cannot prove the absence of lyrics.
- **Factual accuracy** (the lead is true, the cited sources support it): has **no** code guard at all. `CommentarySchema` checks only that `sources` holds at least one valid URL, not that the domain is reputable, that there are enough sources, or that they back the claim. The human read-through is the sole guard.

So ADR-0007's human gate is most load-bearing precisely where no code guard exists. Removing it wholesale would leave accuracy undefended, the trust hole ADR-0007 named. The resolution is not to drop the human or to trust an unattended generator, but to make the code gate primary where it can be, and target the human where it cannot.

## Decision

Code is the primary publish gate. The human is retained but targeted by risk, not applied uniformly. A blurb's risk is made explicit and machine-readable so the gate can act on it.

- **Risk tier is an explicit field.** `CommentarySchema` gains `claim: "what-it-is" | "why-charting"`. The "what a song is about" claim is stable and verifiable; the "why it is charting" claim is time-sensitive and error-prone. The tier is a property of the claim, set when the blurb is authored.
- **The safe tier (`what-it-is`) is auto-publishable** when it clears every deterministic check: the no-lyric lint, a source-authority check (domain allowlist and denylist plus a minimum source count, codifying the playbook's prose policy), a tier-consistency lint, and a grounding check in which an LLM confirms the cited source actually supports the lead.
- **The risky tier (`why-charting`) always requires human review.** Time-sensitive causal claims are where human judgment earns its keep; no deterministic check substitutes for it.
- **Self-classification is itself guarded.** A tier-consistency lint flags a `what-it-is` blurb whose text carries causal or temporal language (a why-charting signal), routing it to human review rather than auto-publish. This mirrors the no-lyric lint: tuned to flag rather than miss.
- **The human still spot-checks the safe tier** by sampling, so the LLM grounding check sits under human oversight rather than replacing it outright.

### Why code-primary with tiering over the two extremes

Uniform human review (ADR-0007) does not scale with the automation goal. Fully unattended publish fails on cost and risk: accuracy has no ground truth to check against at publish time, the volume the significance trigger admits is small enough that reviewing it is cheap, and a wrong public claim about a real song is a credibility hit (or, for lyrics, a licensing one). The reference ADR-0007 cited shows review outweighs generation in effort and that residual error persists even with review. Tiering keeps the human exactly on the axis (time-sensitive accuracy) the evidence says needs them, and lets code own the stable axis it can actually guard.

### Decoupled from go-live

This gate is an efficiency change, not a prerequisite for the card. The manual flow already publishes commentary; the card goes live as soon as `COMMENTARY_BLOB_URL` is set and a first pass publishes. This work reduces the human load on later passes and does not block turning the card on.

## Consequences

**Positive**

- Accuracy gains its first code guard (source-authority plus grounding), closing the gap the human alone covered.
- Human effort concentrates on the high-error tier instead of every blurb, which is what makes the pipeline scale.
- Self-classification is not blindly trusted: the tier-consistency lint backstops it.

**Negative**

- The grounding check adds an LLM call to the publish path, with its own cost and fallibility. It is bounded to the safe tier and sits under human sampling, but it is an LLM checking an LLM.
- Authoring now carries a classification decision (`claim`), one more thing to get right, mitigated by the consistency lint.

**Neutral**

- The rest of the ADR-0007 architecture is untouched; only the trust model changes.
- Per-language commentary remains additive: the tier field is orthogonal to the `lang:` key dimension.
