import type { Claim, Commentary } from "./chart-schema";
import { lintCommentary } from "./no-lyric-lint";
import { findSourceViolations } from "./source-authority";
import { lintTierConsistency } from "./tier-consistency-lint";

/**
 * The capstone of the commentary gate: it turns a blurb's claim tier and the
 * outcome of every check into a single routing decision, so the whole publish
 * policy lives in one legible place (ADR-0009). A blurb publishes only when it
 * clears every check; any failure drops the card, with no human queue. Both
 * tiers run the identical gate; the tier no longer forces a human-review
 * branch. Pure, so the decision table is unit-tested without the publish shell.
 */

/**
 * Every check's outcome, as a pass/fail boolean (true = passed). The three
 * deterministic checks come from `deterministicChecks`; `grounding` is the
 * verdict of the async grounding check, added by the publish shell.
 */
export interface GateChecks {
  noLyric: boolean;
  sourceAuthority: boolean;
  tierConsistency: boolean;
  grounding: boolean;
}

export type GateDecision = "publish" | "drop";

/**
 * The deterministic check outcomes, run from a blurb's own fields. A check
 * passes when it finds no violations. Returns everything but `grounding`, which
 * the publish shell adds after the async grounding check, since this layer
 * stays pure and network-free.
 */
export function deterministicChecks(
  entry: Commentary,
): Omit<GateChecks, "grounding"> {
  return {
    noLyric: lintCommentary(entry).length === 0,
    sourceAuthority: findSourceViolations(entry).length === 0,
    tierConsistency: lintTierConsistency(entry).length === 0,
  };
}

export function classifyGate(_tier: Claim, checks: GateChecks): GateDecision {
  // Both tiers route on one rule (ADR-0009): publish only when every gate
  // passes, drop on any failure. The tier is accepted to keep the per-tier seam
  // the signature documents, but is decision-neutral today. Naming each gate
  // (over iterating the object) forces a future check to be wired in here.
  const allPass =
    checks.noLyric &&
    checks.sourceAuthority &&
    checks.tierConsistency &&
    checks.grounding;
  return allPass ? "publish" : "drop";
}
