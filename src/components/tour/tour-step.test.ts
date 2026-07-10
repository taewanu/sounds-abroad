import { describe, expect, test } from "vitest";

import { initialTourState, tourReducer, type TourState } from "./tour-step";

const onGesture: TourState = { beat: "gesture" };
const onSheet: TourState = { beat: "sheet" };
const onAudio: TourState = { beat: "audio" };

describe("initialTourState", () => {
  test("opens on the gesture beat", () => {
    expect(initialTourState()).toEqual({ beat: "gesture" });
  });
});

describe("tourReducer gesture beat", () => {
  test("performing the gesture advances to the sheet beat", () => {
    const next = tourReducer(onGesture, { type: "USER_SELECTED" });

    expect(next.beat).toBe("sheet");
  });

  test("an unrelated event leaves the gesture beat unchanged", () => {
    const next = tourReducer(onGesture, { type: "SHEET_OPENED" });

    expect(next).toEqual(onGesture);
  });
});

describe("tourReducer later beats", () => {
  test("opening the sheet advances to the audio beat", () => {
    const next = tourReducer(onSheet, { type: "SHEET_OPENED" });

    expect(next.beat).toBe("audio");
  });

  test("a stray selection during the sheet beat does not skip it", () => {
    const next = tourReducer(onSheet, { type: "USER_SELECTED" });

    expect(next.beat).toBe("sheet");
  });

  test("previewing a track finishes the tour", () => {
    const next = tourReducer(onAudio, { type: "TRACK_PREVIEWED" });

    expect(next.beat).toBe("done");
  });
});

describe("tourReducer exit", () => {
  test("Skip ends the tour from any beat", () => {
    expect(tourReducer(onGesture, { type: "SKIP" }).beat).toBe("done");
    expect(tourReducer(onSheet, { type: "SKIP" }).beat).toBe("done");
    expect(tourReducer(onAudio, { type: "SKIP" }).beat).toBe("done");
  });

  test("done is terminal", () => {
    const done: TourState = { beat: "done" };

    const next = tourReducer(done, { type: "USER_SELECTED" });

    expect(next).toEqual(done);
  });
});
