/**
 * The grounding check: an LLM confirms the cited sources actually STATE a
 * blurb's claims before it can auto-publish (ADR-0009), in place of a human's
 * claim-to-source read. This module is the pure verdict seam; the fetch and
 * model call live in an injectable shell so the decision logic is tested
 * without touching the network. The model is reached through an injected
 * client, so the auth and model backend stay swappable here.
 *
 * Threshold is STATES, not merely consistent-with: a claim counts as grounded
 * only when a source explicitly states it. The model answers with a tri-state
 * judgment so the seam can fail safe on "uncertain" the same way it fails safe
 * on "ungrounded". A missed ungrounded claim auto-publishes a wrong public
 * claim, while a false flag only drops one card, so the seam errs toward the
 * cheaper mistake.
 */

export interface GroundingVerdict {
  grounded: boolean;
  reason: string;
}

/**
 * What the injected client returns: the model's own judgment. `status` is
 * typed as a string, not the three-way union, because it is parsed from model
 * output and can be anything; the seam defends against unexpected values rather
 * than trusting the shape.
 */
export interface RawGroundingJudgment {
  status: string;
  reason?: string;
}

export type GroundingClient = (prompt: string) => Promise<RawGroundingJudgment>;

/**
 * The judge prompt. It states the STATES threshold explicitly and asks for a
 * tri-state answer, so "I cannot tell" is a first-class response the seam can
 * collapse to not-grounded rather than a coin-flip between grounded and not.
 */
export function buildGroundingPrompt(
  claimText: string,
  sourceText: string,
): string {
  return [
    "You verify whether cited source text states the claims a short music blurb makes.",
    "A claim is grounded ONLY if the source text explicitly states it. Being merely consistent with the source, or not contradicted by it, is NOT enough.",
    'Answer "grounded" only when every claim is explicitly stated by the source. Answer "ungrounded" if any claim is not stated. Answer "uncertain" if you cannot tell.',
    "",
    'Respond with a JSON object: { "status": "grounded" | "ungrounded" | "uncertain", "reason": "<one sentence>" }.',
    "",
    "CLAIM:",
    claimText,
    "",
    "SOURCE TEXT:",
    sourceText,
  ].join("\n");
}

/**
 * The verdict seam: build the prompt from the blurb's claims, ask the injected
 * client, and collapse its judgment into the boolean the gate classifier
 * routes on. An empty `detail` grounds the lead alone.
 */
export async function gradeGrounding(
  lead: string,
  detail: string | undefined,
  sourceText: string,
  judge: GroundingClient,
): Promise<GroundingVerdict> {
  const claimText = [lead, detail]
    .filter((t): t is string => Boolean(t && t.trim()))
    .join("\n\n");
  const raw = await judge(buildGroundingPrompt(claimText, sourceText));
  return interpretJudgment(raw);
}

/**
 * Collapse the model's tri-state judgment into the boolean verdict the gate
 * classifier routes on. The collapse must fail safe: only a confident, well-formed "grounded"
 * yields `grounded: true`; "ungrounded", "uncertain", or any unexpected or
 * malformed value leaves the blurb not-grounded, which drops the card.
 */
function interpretJudgment(raw: RawGroundingJudgment): GroundingVerdict {
  const status = raw.status?.trim();
  const reason = raw.reason?.trim();
  if (status === "grounded" && reason) {
    return { grounded: true, reason };
  }
  return {
    grounded: false,
    reason: reason || `No usable judgment (status: ${status || "missing"}).`,
  };
}
