// Decides what a released track-skip swipe does: commit to the next or previous
// track, or spring back. Pure so the whole matrix (short-but-fast flick,
// long-but-slow drag, a commit toward the chart end) is table-testable without a
// browser, matching the gesture-judgment leaves `tap-detect` and `spin-gesture`.

export interface SwipeCommitConfig {
  // Past this fraction of the swipe area's width, a release commits.
  commitThresholdPct: number;
  // A fast flick commits even below the distance threshold.
  flickToCommit: boolean;
  // Minimum release speed (px/ms) that counts as a flick.
  flickVelPxPerMs: number;
}

export type SwipeOutcome = "next" | "prev" | "cancel";

export interface SwipeSample {
  // Total horizontal travel since press (px); negative is leftward.
  dx: number;
  // Release velocity (px/ms); its sign is the flick direction.
  vx: number;
  // Swipe-area width (px), the basis for the percentage threshold.
  width: number;
  // Whether a previous / next track exists to skip to (chart-end clamp).
  canPrev: boolean;
  canNext: boolean;
}

// Swipe left (dx < 0) skips to the next track, swipe right to the previous:
// the carousel convention. A release commits when it clears the distance
// threshold OR flicks fast enough (when enabled); otherwise it springs back.
// A commit toward a side with no track (chart end, before the roll logic in the
// caller) cancels instead.
export function decideSwipeCommit(
  sample: SwipeSample,
  cfg: SwipeCommitConfig,
): SwipeOutcome {
  const { dx, vx, width, canPrev, canNext } = sample;

  // No travel: nothing to judge.
  if (dx === 0) return "cancel";

  // Distance needs a width to size the threshold against; a flick doesn't, so
  // the width guard sits here, not over the whole decision.
  const pastDistance =
    width > 0 && Math.abs(dx) / width >= cfg.commitThresholdPct / 100;
  // A flick counts only when the release accelerates the same way the drag
  // went; a finger reversing at the last instant is not a commit.
  const flicked =
    cfg.flickToCommit &&
    Math.abs(vx) >= cfg.flickVelPxPerMs &&
    Math.sign(vx) === Math.sign(dx);
  if (!pastDistance && !flicked) return "cancel";

  const dir: SwipeOutcome = dx < 0 ? "next" : "prev";

  // Nowhere to skip to on that side (chart end, before the caller's roll): hold.
  if (dir === "next" && !canNext) return "cancel";
  if (dir === "prev" && !canPrev) return "cancel";
  return dir;
}
