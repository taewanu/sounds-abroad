import { expect, test } from "vitest";

import {
  type SwipeCommitConfig,
  type SwipeSample,
  decideSwipeCommit,
} from "./swipe-commit";

const CFG: SwipeCommitConfig = {
  commitThresholdPct: 33,
  flickToCommit: true,
  flickVelPxPerMs: 0.5,
};

const WIDTH = 300; // threshold = 33% => 99px

const sample = (over: Partial<SwipeSample>): SwipeSample => ({
  dx: 0,
  vx: 0,
  width: WIDTH,
  canPrev: true,
  canNext: true,
  ...over,
});

test("a still release with no travel springs back", () => {
  expect(decideSwipeCommit(sample({ dx: 0 }), CFG)).toBe("cancel");
});

test("a zero-width area can't measure a threshold, so it cancels", () => {
  expect(decideSwipeCommit(sample({ dx: -200, width: 0 }), CFG)).toBe("cancel");
});

test("a slow drag past the threshold to the left skips to the next track", () => {
  expect(decideSwipeCommit(sample({ dx: -120 }), CFG)).toBe("next");
});

test("a slow drag past the threshold to the right skips to the previous track", () => {
  expect(decideSwipeCommit(sample({ dx: 120 }), CFG)).toBe("prev");
});

test("a drag short of the threshold with no flick springs back", () => {
  expect(decideSwipeCommit(sample({ dx: -60, vx: -0.1 }), CFG)).toBe("cancel");
});

test("a short but fast leftward flick commits to the next track", () => {
  expect(decideSwipeCommit(sample({ dx: -40, vx: -0.9 }), CFG)).toBe("next");
});

test("a flick whose velocity opposes the drag does not commit", () => {
  expect(decideSwipeCommit(sample({ dx: -40, vx: 0.9 }), CFG)).toBe("cancel");
});

test("with flick disabled a short fast swipe still springs back", () => {
  const noFlick = { ...CFG, flickToCommit: false };
  expect(decideSwipeCommit(sample({ dx: -40, vx: -0.9 }), noFlick)).toBe(
    "cancel",
  );
});

test("a drag exactly at the threshold commits", () => {
  expect(decideSwipeCommit(sample({ dx: -99 }), CFG)).toBe("next");
});

test("a next-ward commit at the last track clamps to a spring-back", () => {
  expect(decideSwipeCommit(sample({ dx: -120, canNext: false }), CFG)).toBe(
    "cancel",
  );
});

test("a prev-ward commit at the first track clamps to a spring-back", () => {
  expect(decideSwipeCommit(sample({ dx: 120, canPrev: false }), CFG)).toBe(
    "cancel",
  );
});
