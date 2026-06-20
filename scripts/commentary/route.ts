import type { Commentary } from "../../src/lib/chart-schema";
import type { CommentaryStore } from "../../src/lib/commentary-store";
import {
  classifyGate,
  deterministicChecks,
  type GateChecks,
} from "../../src/lib/gate-classifier";
import type { GroundingVerdict } from "../../src/lib/grounding";
import { lintCommentary } from "../../src/lib/no-lyric-lint";

/**
 * Per-entry routing: the publish-side half of the gate (ADR-0009). It runs each
 * blurb's checks, asks the classifier whether to publish or drop, and returns
 * the surviving store plus a record of every drop and why. A drop costs only
 * that one card — the crawl carries a missing blurb forward as no card (ADR-0007)
 * — so a failing entry never blocks its neighbours; the old whole-store
 * hard-block is gone. Grounding is injected so the routing decision is tested
 * without the network or the judge subprocess.
 */

export interface RouteDeps {
  ground: (entry: Commentary) => Promise<GroundingVerdict>;
}

export interface DropRecord {
  key: string;
  reasons: string[];
}

export interface RouteResult {
  published: CommentaryStore;
  dropped: DropRecord[];
}

/**
 * Names the deterministic checks an entry failed, for the drop log. The
 * no-lyric failure also carries its sub-rule and excerpt so a batch's drops
 * self-classify: a quoted-span on a long title reads as a false positive, a
 * verse-shaped run as a real catch.
 */
function failedDeterministic(
  entry: Commentary,
  checks: Omit<GateChecks, "grounding">,
): string[] {
  const failed: string[] = [];
  if (!checks.noLyric) {
    const detail = lintCommentary(entry)
      .map((risk) => `${risk.rule} ${risk.excerpt}`)
      .join("; ");
    failed.push(detail ? `no-lyric: ${detail}` : "no-lyric");
  }
  if (!checks.sourceAuthority) failed.push("source-authority");
  if (!checks.tierConsistency) failed.push("tier-consistency");
  return failed;
}

export async function routeStore(
  store: CommentaryStore,
  deps: RouteDeps,
): Promise<RouteResult> {
  const published: CommentaryStore = {};
  const dropped: DropRecord[] = [];

  for (const [key, entry] of Object.entries(store)) {
    const det = deterministicChecks(entry);
    const detFailures = failedDeterministic(entry, det);

    // Grounding is a network call and a model turn; the gate ANDs every check,
    // so an entry already failing a deterministic check is doomed. Skip the
    // grounding call for it — both to save the cost and to keep the drop reason
    // pointed at the real failure rather than a grounding it never ran.
    let grounded = false;
    let groundingReason: string | undefined;
    if (detFailures.length === 0) {
      const verdict = await deps.ground(entry);
      grounded = verdict.grounded;
      // A grounding failure must always carry a reason for the drop log, even
      // if the verdict's own reason came back empty.
      if (!grounded)
        groundingReason = verdict.reason.trim() || "Grounding failed.";
    }

    // The classifier is the single arbiter; routing only assembles its inputs
    // and records why a drop happened.
    if (
      classifyGate(entry.claim, { ...det, grounding: grounded }) === "publish"
    ) {
      published[key] = entry;
      continue;
    }

    const reasons = [...detFailures];
    if (groundingReason) reasons.push(`grounding: ${groundingReason}`);
    dropped.push({ key, reasons });
  }

  return { published, dropped };
}
