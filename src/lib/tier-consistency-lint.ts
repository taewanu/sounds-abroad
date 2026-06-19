import type { Commentary } from "./chart-schema";

/**
 * Deterministic backstop on a blurb's self-classified claim tier. A
 * `what-it-is` blurb is meant to be a stable note about the song; a
 * `why-charting` blurb is the time-sensitive one that explains current chart
 * movement (ADR-0008). This lint flags a `what-it-is` entry whose text actually
 * reads like a why-charting claim (causal or temporal/virality language), so it
 * can be routed to human review rather than auto-published under the wrong tier.
 *
 * It only ever flags `what-it-is`; the same language is allowed (and expected)
 * in `why-charting`. The gate classifier drops a flagged blurb rather than
 * routing it to a person (ADR-0009), so the vocabulary is tuned for PRECISION:
 * a false flag no longer costs a reviewer a glance, it discards a good card.
 * Grounding, not this lint, is the correctness gate; this only keeps a
 * time-sensitive claim from auto-publishing under the stable tier.
 */

export interface TierConsistencyViolation {
  rule: "causal-language" | "temporal-language";
  marker: string;
}

/**
 * Markers that assert a CAUSE for charting ("it charted because/after X"). A
 * what-it-is blurb describes the song; reaching for cause is a why-charting
 * move. Multi-word markers ("due to", "thanks to") are matched as phrases.
 */
const CAUSAL_MARKERS = [
  "because",
  "due to",
  "thanks to",
  "sparked",
  "drove",
  "driven by",
  "fueled",
  "fuelled",
  "propelled",
  "boosted",
  "powered by",
];

/**
 * Markers of momentum or virality ("surging this week", "blew up"). These
 * describe a song's current MOVEMENT, which is a why-charting concern; a stable
 * what-it-is note has no reason to reach for them.
 */
const TEMPORAL_MARKERS = [
  "surged",
  "surging",
  "spiked",
  "soared",
  "soaring",
  "viral",
  "trending",
  "this week",
  "exploded",
  "blew up",
  // Charting-context debut phrases only: a bare "debut" describes a release
  // ("their debut album") and must not flag; "debuted at #2" is chart movement.
  "debuted at",
  "debuted on",
  "chart debut",
  "climbing",
  "jumped",
  "skyrocketed",
  "breakout",
];

/**
 * To extend either list: add a phrase a why-charting blurb would use and a
 * stable what-it-is note would not. Prefer PRECISION over reach: a flagged
 * what-it-is blurb is dropped, not reviewed (ADR-0009), so a marker that fires
 * on benign stable prose costs a good card. This is why bare "after" and
 * "following" are absent — they read as plain sequence in stable notes ("their
 * album after X", "following their debut") far more often than as a charting
 * cause. Keep entries lowercase; matching is case-insensitive and on word
 * boundaries, so a marker never fires on a substring inside another word
 * ("surge" will not match "resurgence"). A word that reads both ways (like
 * "debut", stable in "debut album" but charting in "debuted at #2") belongs as
 * a charting-context PHRASE, not a bare word.
 */

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word, case-insensitive match for a (possibly multi-word) marker. */
function containsMarker(text: string, marker: string): boolean {
  const pattern = new RegExp(`\\b${escapeForRegExp(marker)}\\b`, "i");
  return pattern.test(text);
}

function findMarkers(
  text: string,
  markers: string[],
  rule: TierConsistencyViolation["rule"],
): TierConsistencyViolation[] {
  return markers
    .filter((marker) => containsMarker(text, marker))
    .map((marker) => ({ rule, marker }));
}

/** Every tier-consistency signal in a single block of text. */
export function findTierSignals(text: string): TierConsistencyViolation[] {
  return [
    ...findMarkers(text, CAUSAL_MARKERS, "causal-language"),
    ...findMarkers(text, TEMPORAL_MARKERS, "temporal-language"),
  ];
}

/**
 * Tier-consistency violations across a commentary entry's human-authored
 * fields. A `why-charting` entry is never flagged: that language belongs there,
 * so the lint short-circuits to an empty result before scanning any text.
 */
export function lintTierConsistency(
  entry: Commentary,
): TierConsistencyViolation[] {
  if (entry.claim !== "what-it-is") return [];

  const fields = [entry.lead, entry.detail, entry.tag].filter(
    (f): f is string => typeof f === "string",
  );
  return fields.flatMap(findTierSignals);
}
