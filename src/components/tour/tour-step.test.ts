import { describe, expect, test } from "vitest";

import {
  currentBeat,
  initialTourState,
  learnedSoFar,
  tourReducer,
} from "./tour-step";

describe("initialTourState", () => {
  test("runs all three teachable beats by default, opening on the gesture beat", () => {
    const state = initialTourState();

    expect(currentBeat(state)).toBe("gesture");
    expect(learnedSoFar(state)).toEqual([]);
  });

  test("runs only the given subset, opening on its first beat", () => {
    const state = initialTourState(["sheet", "audio"]);

    expect(currentBeat(state)).toBe("sheet");
  });

  test("an empty subset is already done", () => {
    expect(currentBeat(initialTourState([]))).toBe("done");
  });
});

describe("tourReducer beat progression", () => {
  test("performing a beat's gesture advances to the next beat and records it learned", () => {
    const next = tourReducer(initialTourState(), { type: "USER_SELECTED" });

    expect(currentBeat(next)).toBe("sheet");
    expect(learnedSoFar(next)).toEqual(["gesture"]);
  });

  test("a beat completes only on its own event; a stray event is ignored", () => {
    const state = initialTourState();

    expect(tourReducer(state, { type: "SHEET_OPENED" })).toEqual(state);
  });

  test("walks the full sequence to done, learning each beat performed", () => {
    let state = initialTourState();
    state = tourReducer(state, { type: "USER_SELECTED" });
    state = tourReducer(state, { type: "SHEET_OPENED" });
    state = tourReducer(state, { type: "TRACK_PREVIEWED" });

    expect(currentBeat(state)).toBe("done");
    expect(learnedSoFar(state)).toEqual(["gesture", "sheet", "audio"]);
  });

  test("a subset advances through only its beats", () => {
    const next = tourReducer(initialTourState(["sheet"]), {
      type: "SHEET_OPENED",
    });

    expect(currentBeat(next)).toBe("done");
    expect(learnedSoFar(next)).toEqual(["sheet"]);
  });
});

describe("tourReducer exit", () => {
  test("Skip dismisses from any beat and learns only what was performed first", () => {
    const performed = tourReducer(initialTourState(), {
      type: "USER_SELECTED",
    });
    const dismissed = tourReducer(performed, { type: "SKIP" });

    expect(currentBeat(dismissed)).toBe("done");
    expect(dismissed.dismissed).toBe(true);
    // Only the gesture was performed before the X; the rest stay un-learned.
    expect(learnedSoFar(dismissed)).toEqual(["gesture"]);
  });

  test("done is terminal", () => {
    const done = initialTourState([]);

    expect(tourReducer(done, { type: "USER_SELECTED" })).toEqual(done);
  });
});
