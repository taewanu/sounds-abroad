// The tour's memory of what a user has actually learned, so a later launch
// re-teaches only the gestures they haven't performed and never nags. Pure: the
// host reads the persisted record, asks decideShow what to run, and folds the
// run's outcome back in. Only the three linear beats are teachable here; the
// double-tap skip lives in its own contextual hint with its own record.

import type { TeachBeat } from "./tour-step";
import { TEACH_ORDER } from "./tour-step";

export interface TourRecord {
  learned: TeachBeat[];
  shows: number;
  dismissed: boolean;
}

export const emptyRecord: TourRecord = {
  learned: [],
  shows: 0,
  dismissed: false,
};

// A dismissal is permanent and the tour appears at most twice, so a user who
// keeps ignoring gestures still isn't nagged past the cap.
const MAX_SHOWS = 2;

// Whether to run the tour this launch, and which beats: the teachable order
// minus what's already learned. An empty beat list means nothing left to teach.
export function decideShow(record: TourRecord): {
  show: boolean;
  beats: TeachBeat[];
} {
  if (record.dismissed || record.shows >= MAX_SHOWS) {
    return { show: false, beats: [] };
  }
  const beats = TEACH_ORDER.filter((beat) => !record.learned.includes(beat));
  return { show: beats.length > 0, beats };
}

// Count this appearance. Persisted at show time, not at the end, so the cap
// holds even if the user closes the app mid-tour.
export function recordShown(record: TourRecord): TourRecord {
  return { ...record, shows: record.shows + 1 };
}

// Fold a finished run back in: union the gestures the user actually performed
// into learned, and latch dismissed if they closed the tour with the X. Leaves
// shows untouched (recordShown owns that).
export function recordLearned(
  record: TourRecord,
  outcome: { learned: TeachBeat[]; dismissedByX: boolean },
): TourRecord {
  return {
    ...record,
    learned: [...new Set([...record.learned, ...outcome.learned])],
    dismissed: record.dismissed || outcome.dismissedByX,
  };
}

// The tour will never show again: dismissed, capped, or everything learned. The
// commentary hint arms off this, so it waits only while the tour still might run.
export function hasConcluded(record: TourRecord): boolean {
  return !decideShow(record).show;
}
