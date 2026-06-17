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
 * in `why-charting`. Like the no-lyric lint, the vocabulary is tuned to flag
 * rather than miss: a false flag costs a reviewer a glance, a mislabelled blurb
 * that slips through lets a risky time-sensitive claim auto-publish as if it
 * were stable. This is a FLAG-FOR-REVIEW signal, not a publish-blocking gate;
 * the routing that consumes it is the gate classifier, a later slice.
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
  "following",
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
 * stable what-it-is note would not. Prefer over-inclusion; a false flag is
 * cheap, a missed mislabel is not. Keep entries lowercase; matching is
 * case-insensitive and on word boundaries, so a marker never fires on a
 * substring inside another word ("surge" will not match "resurgence"). A word
 * that reads both ways (like "debut", stable in "debut album" but charting in
 * "debuted at #2") belongs as a charting-context PHRASE, not a bare word, or as
 * a context-sensitive check like `after` below.
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

/**
 * "after" asserts a cause in charting prose ("it surged after the final") but
 * is just as often a plain descriptive idiom ("named after a city", "after
 * all"). A bare-word match over-flags, so strip the known idioms first and only
 * count an "after" that survives. This is the one context-sensitive marker: the
 * surrounding words, not the word alone, decide whether it is a why-charting cue.
 */
const AFTER_IDIOMS =
  /\b(?:named|modell?ed|patterned|fashioned|look(?:ing|ed)?|sought)\s+after\b|\bafter\s+(?:all|hours|school)\b|\bafter[-\s]?part(?:y|ies)\b/gi;

function hasCausalAfter(text: string): boolean {
  return /\bafter\b/i.test(text.replace(AFTER_IDIOMS, " "));
}

/** Every tier-consistency signal in a single block of text. */
export function findTierSignals(text: string): TierConsistencyViolation[] {
  const violations = [
    ...findMarkers(text, CAUSAL_MARKERS, "causal-language"),
    ...findMarkers(text, TEMPORAL_MARKERS, "temporal-language"),
  ];
  if (hasCausalAfter(text)) {
    violations.push({ rule: "causal-language", marker: "after" });
  }
  return violations;
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
