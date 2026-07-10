import { describe, expect, test } from "vitest";

import {
  decideShow,
  emptyRecord,
  hasConcluded,
  recordLearned,
  recordShown,
  type TourRecord,
} from "./tour-record";

describe("decideShow", () => {
  test("a first-run (empty) record shows all three teachable beats in order", () => {
    expect(decideShow(emptyRecord)).toEqual({
      show: true,
      beats: ["gesture", "sheet", "audio"],
    });
  });

  test("shows only the beats the user has not yet learned", () => {
    const record: TourRecord = {
      learned: ["gesture", "audio"],
      shows: 1,
      dismissed: false,
    };

    expect(decideShow(record)).toEqual({ show: true, beats: ["sheet"] });
  });

  test("a fully-learned user is shown nothing", () => {
    const record: TourRecord = {
      learned: ["gesture", "sheet", "audio"],
      shows: 1,
      dismissed: false,
    };

    expect(decideShow(record)).toEqual({ show: false, beats: [] });
  });

  test("a dismissed record never shows again, even with un-learned beats", () => {
    const record: TourRecord = {
      learned: ["gesture"],
      shows: 1,
      dismissed: true,
    };

    expect(decideShow(record)).toEqual({ show: false, beats: [] });
  });

  test("the tour is capped at two appearances", () => {
    const record: TourRecord = {
      learned: ["gesture"],
      shows: 2,
      dismissed: false,
    };

    expect(decideShow(record)).toEqual({ show: false, beats: [] });
  });
});

describe("recordShown", () => {
  test("counts an appearance so the cap can be reached, without touching learned or dismissed", () => {
    expect(recordShown(emptyRecord)).toEqual({
      learned: [],
      shows: 1,
      dismissed: false,
    });
  });

  test("increments from a prior count", () => {
    const record: TourRecord = {
      learned: ["gesture"],
      shows: 1,
      dismissed: false,
    };

    expect(recordShown(record).shows).toBe(2);
  });
});

describe("recordLearned", () => {
  test("unions the run's performed gestures into learned without duplicating", () => {
    const record: TourRecord = {
      learned: ["gesture"],
      shows: 1,
      dismissed: false,
    };

    const next = recordLearned(record, {
      learned: ["gesture", "sheet"],
      dismissedByX: false,
    });

    expect(next.learned).toEqual(["gesture", "sheet"]);
  });

  test("latches dismissed on an X dismissal", () => {
    const next = recordLearned(emptyRecord, {
      learned: [],
      dismissedByX: true,
    });

    expect(next.dismissed).toBe(true);
  });

  test("keeps dismissed once latched, even on a later non-X outcome", () => {
    const record: TourRecord = {
      learned: [],
      shows: 1,
      dismissed: true,
    };

    const next = recordLearned(record, {
      learned: ["gesture"],
      dismissedByX: false,
    });

    expect(next.dismissed).toBe(true);
  });

  test("does not change the shows count (that is recordShown's job)", () => {
    const next = recordLearned(emptyRecord, {
      learned: ["gesture"],
      dismissedByX: false,
    });

    expect(next.shows).toBe(0);
  });
});

describe("hasConcluded", () => {
  test("a first-run record has not concluded (the tour will still show)", () => {
    expect(hasConcluded(emptyRecord)).toBe(false);
  });

  test("concludes once dismissed", () => {
    expect(hasConcluded({ learned: [], shows: 1, dismissed: true })).toBe(true);
  });

  test("concludes once every gesture is learned", () => {
    expect(
      hasConcluded({
        learned: ["gesture", "sheet", "audio"],
        shows: 1,
        dismissed: false,
      }),
    ).toBe(true);
  });

  test("concludes once the appearance cap is reached", () => {
    expect(
      hasConcluded({ learned: ["gesture"], shows: 2, dismissed: false }),
    ).toBe(true);
  });
});
