import { hasConcluded } from "./tour-record";
import { readRecord, subscribeRecord } from "./tour-record-store";

// The tour-done gate the commentary hint arms off, derived from the learned-aware
// record: the tour has "concluded" once it will never show again (dismissed,
// every gesture learned, or the appearance cap reached). subscribe fires on every
// record write so a mid-session conclusion reaches the hint, which outlives the
// tour. A boolean reactive-store shape (subscribe + snapshot) for useSyncExternalStore.
export const tourConcluded = {
  isConcluded: (): boolean => hasConcluded(readRecord()),
  subscribe: subscribeRecord,
};
