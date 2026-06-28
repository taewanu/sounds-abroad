import { describe, expect, test } from "vitest";

import { initialTourState, tourReducer, type TourState } from "./tour-step";

const gestureTry: TourState = { beat: "gesture", gesturePhase: "try" };
const gestureReady: TourState = { beat: "gesture", gesturePhase: "ready" };
const onSheet: TourState = { beat: "sheet", gesturePhase: "ready" };
const onAudio: TourState = { beat: "audio", gesturePhase: "ready" };

describe("initialTourState", () => {
  test("opens on the gesture beat inviting the user to try", () => {
    expect(initialTourState()).toEqual({
      beat: "gesture",
      gesturePhase: "try",
    });
  });
});

describe("tourReducer gesture beat", () => {
  test("the first selection reveals Next without advancing the beat", () => {
    const next = tourReducer(gestureTry, { type: "USER_SELECTED" });

    expect(next).toEqual({ beat: "gesture", gesturePhase: "ready" });
  });

  test("Next advances the gesture beat to the sheet once the user is ready", () => {
    const next = tourReducer(gestureReady, { type: "NEXT" });

    expect(next.beat).toBe("sheet");
  });

  test("an unrelated event leaves the gesture beat unchanged", () => {
    const next = tourReducer(gestureTry, { type: "SHEET_OPENED" });

    expect(next).toEqual(gestureTry);
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

  test("Next on the audio beat finishes the tour", () => {
    const next = tourReducer(onAudio, { type: "NEXT" });

    expect(next.beat).toBe("done");
  });
});

describe("tourReducer exit", () => {
  test("Skip ends the tour from any beat", () => {
    expect(tourReducer(gestureTry, { type: "SKIP" }).beat).toBe("done");
    expect(tourReducer(onSheet, { type: "SKIP" }).beat).toBe("done");
    expect(tourReducer(onAudio, { type: "SKIP" }).beat).toBe("done");
  });

  test("done is terminal", () => {
    const done: TourState = { beat: "done", gesturePhase: "ready" };

    const next = tourReducer(done, { type: "NEXT" });

    expect(next).toEqual(done);
  });
});
