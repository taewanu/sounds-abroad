# ADR-0009: Fully automated commentary gate, no human in the publish path

**Status:** Accepted (2026-06-18)

Supersedes the human-in-the-loop disposition of [ADR-0008](0008-risk-tiered-commentary-gate.md). The rest of ADR-0008 (code as the primary gate, the explicit risk tier, the deterministic checks, the grounding check) stands and is in fact made central. Only the human leaves: where ADR-0008 routed the risky tier to a person and sampled the safe tier, this ADR removes the person from the publish path entirely.

## Context

ADR-0008 kept the human on one axis (time-sensitive accuracy) and let code own the rest. Two facts make even that residual human role unsustainable. The maintainer is solo, and the roadmap expands commentary coverage from a handful of blurbs toward hundreds; at that volume, reviewing the risky tier and sampling the safe tier costs hours per pass that a solo project cannot spend. ADR-0008 named the underlying tension itself ("human review is load-bearing" against "the pipeline cannot lean on per-entry human review") and resolved it by targeting the human. This ADR finishes the move: take the human out of the path, because the code guards ADR-0008 introduced can carry both tiers once two things hold:

- The default on any doubt is to drop the card, not to escalate to a person. The crawl's existing carry-forward contract (ADR-0007) already renders a missing blurb as no card, so a dropped blurb costs coverage, never correctness.
- What is machine-verifiable is verified, and what is not is declined rather than guessed. This is the standard automated-fact-checking shape (retrieve, find evidence, judge whether the evidence states the claim, drop on "not enough"), the same shape ADR-0008's grounding check already follows.

## Decision

No human gates a publish. Every blurb passes or fails on code alone, and failure means no card.

- **Code is the whole gate.** A blurb publishes only when it clears each deterministic check (the no-lyric lint, the source-authority guard, the tier-consistency lint) and the grounding check. Any failure drops the card. There is no review queue.
- **Fail-closed means "no card," not "to a human."** An ungrounded, uncertain, or malformed grounding verdict, an unreachable source, or a judge error all drop the blurb. The worst case is lower coverage; a wrong public claim never auto-publishes.
- **Both tiers run the same gate.** `why-charting` is no longer human-only. It auto-publishes when it clears the deterministic checks and grounding, and is dropped otherwise, exactly like `what-it-is`. The tier still selects how strictly a claim must be sourced (below), not whether a person sees it.
- **Grounding judges against the sources that loaded, not all-or-nothing.** A claim is grounded only if a live source explicitly states it; a source that fails to fetch cannot ground anything, but the sources that did load still judge their own claims. Because STATES is the threshold, a claim whose only support was an unreachable source is dropped anyway. In the single-pass flow (draft, cite, ground on the same live sources) an unreachable cited source is an edge case, not the norm.
- **For the risky tier, separate the verifiable fact from the speculative cause.** A chart-movement claim ("re-entered the top ten, a new peak") is verifiable from the pipeline's own current-versus-carried rank data and needs no external source. A causal claim ("after a film placement") is speculative and publishes only when an authoritative source states it; absent that, the causal clause is dropped while the movement fact stands.
- **Confidence signals are binary gates, not a score.** Three signals decide a claim: grounding (a source states it), corroboration (how many sources state it), and source authority (a curated tier). Each is a yes/no gate, ANDed together, never summed into a number that a threshold then cuts. Corroboration counts may be logged for telemetry but do not gate on a tuned threshold.
- **Source trust is curated, not learned.** Authority is a hand-maintained allowlist tier layered on the existing denylist (the NewsGuard / Media Bias-Fact Check pattern: a slow-moving registry a person owns). One top-tier source can stand in for corroboration; weaker sources need corroboration. A learned per-source reputation (the truth-discovery / Knowledge Vault loop) is deferred (see below).
- **Spot-checking is optional and off the publish path.** The maintainer may audit samples at any time to confirm the gates hold; no publish waits on it.

### Why binary gates over a confidence score

The established systems that emit calibrated confidence scores earn the right to: Google's Knowledge Vault fuses web-scale extractor agreement with supervised learning to produce calibrated probabilities, NewsGuard's score is assigned by human analysts against weighted criteria, and RAGAS-style faithfulness ratios are an evaluation metric, not a publish gate. A score is only as trustworthy as its calibration, and calibration needs labeled outcomes (blurbs known right or wrong) that this project does not have. With an extreme cost asymmetry, a wrong public claim against a dropped card, an uncalibrated score is false precision. Binary gates on interpretable signals (a source states it; it is in the authority tier; N sources agree) need no calibration and fail safe. The same researched methods still apply, fact-checking entailment, authority tiering, multi-source corroboration; only the final combination is AND-of-gates rather than a weighted sum.

### Why curated authority now and learned reputation later

Learned reputation (a source's trust rising as it is seen to state facts that hold) is the truth-discovery loop, and it is the right method at web scale, where massive redundancy supplies the ground-truth signal the loop trains on. This pipeline produces no such signal: the grounding check confirms a claim is stated by a source, never that the claim is true in the world, and at this volume there is neither the redundancy nor the labels to converge a per-source score. Reputation here would be circular (learning from its own verdicts) or empty (cold-start on sources seen once). The curated authority list captures the same intent with a person as the slow update rule. Logging per-source pass and fail rates is cheap and feeds that manual curation, and is also the on-ramp: once enough labeled track record accumulates, or a machine-verifiable fact oracle (a structured music database, the chart data itself) is wired in, a learned reputation becomes calibratable.

## Consequences

**Positive**

- The pipeline runs unattended. Coverage scales with drafting effort, not maintainer hours.
- Everything published is code-verified end to end; the failure mode is a missing card, never a wrong one.
- Lenient grounding keeps a card whose live sources fully support it, and the fact-versus-cause split keeps the risky tier publishable without trusting speculation.

**Negative**

- Coverage falls to whatever the gates pass. Flowery, inferred, or under-sourced blurbs never publish. The lever for low coverage is tighter drafting or a broader authority list, never loosening the gate.
- Accuracy now rests entirely on the grounding LLM plus the lints, with no human sampling as a standing net. The residual risk is the grounding check's false negatives, bounded by the conservative STATES threshold and optional ad-hoc auditing. It remains an LLM checking an LLM.
- The authority allowlist and the source pass/fail log are new maintenance, though light and asynchronous.

**Neutral**

- ADR-0007's architecture and ADR-0008's code-primary tiering are untouched; only the human disposition changes.
- A confidence score and a learned reputation remain available as future work when labels or a verifiable oracle arrive.

## Amendment (2026-06-19): tiered authority allowlist

The curated authority list is realized and split by what a source can vouch for: journalism with editorial accountability vouches a blurb for either claim tier, while chart and certification bodies corroborate a position or metric only and never satisfy the authority rule alone. This closes a gap in the flat seed list shipped with the gate's first cut, where a chart body could vouch a `why-charting` cause it cannot support. Codified as `AUTHORITY_ALLOWLIST` and `CHART_BODY_DOMAINS` in `src/lib/source-authority.ts`, regionally broadened so non-English tracks clear the bar.

## Amendment (2026-06-23): the drop decision persists, bounding re-drafts

A drop now leaves a trace. Until this change a dropped blurb was logged and forgotten, so the drafting worklist re-included the track on the next batch and re-spent a drafter call to reach the same drop; a track that fails the gate deterministically was re-drafted on every batch forever. The gate's drop side gains memory: a drop ledger (`commentary/v1/drops.json`, separate from the baked store so a tombstone never reaches the served charts) records a per-key attempt count, and the worklist skips a track once it reaches the attempt budget (`DEFAULT_MAX_ATTEMPTS`, 2: one draft plus one retry). A published key clears from the ledger, so a track that finally passes on a re-draft is never tombstoned, and a transient miss still gets its retry. The bound is on gate drops only; a draft that never returns (a research or subprocess failure) is a separate class and does not count against the budget. Manual revisit stays open by editing the ledger.
