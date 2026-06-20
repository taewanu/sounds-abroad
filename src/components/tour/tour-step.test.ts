import { describe, expect, test } from "vitest";

import { initialTourState, tourReducer, type TourState } from "./tour-step";

const gestureWatch: TourState = { beat: "gesture", gesturePhase: "watch" };
const gestureTry: TourState = { beat: "gesture", gesturePhase: "try" };
const onSheet: TourState = { beat: "sheet", gesturePhase: "try" };
const onAudio: TourState = { beat: "audio", gesturePhase: "try" };

describe("initialTourState", () => {
  test("opens on the gesture beat watching the demo when motion is allowed", () => {
    const state = initialTourState(false);

    expect(state).toEqual({ beat: "gesture", gesturePhase: "watch" });
  });

  test("skips the watch phase under reduced motion", () => {
    const state = initialTourState(true);

    expect(state.gesturePhase).toBe("try");
  });
});

describe("tourReducer gesture beat", () => {
  test("the demo settling hands the user control", () => {
    const next = tourReducer(gestureWatch, { type: "GHOST_DONE" });

    expect(next).toEqual({ beat: "gesture", gesturePhase: "try" });
  });

  test("a selection during the try phase advances to the sheet beat", () => {
    const next = tourReducer(gestureTry, { type: "USER_SELECTED" });

    expect(next.beat).toBe("sheet");
  });

  test("Next advances the gesture beat to the sheet", () => {
    const next = tourReducer(gestureWatch, { type: "NEXT" });

    expect(next.beat).toBe("sheet");
  });

  test("an unrelated event leaves the gesture beat unchanged", () => {
    const next = tourReducer(gestureWatch, { type: "SHEET_OPENED" });

    expect(next).toEqual(gestureWatch);
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
    expect(tourReducer(gestureWatch, { type: "SKIP" }).beat).toBe("done");
    expect(tourReducer(onSheet, { type: "SKIP" }).beat).toBe("done");
    expect(tourReducer(onAudio, { type: "SKIP" }).beat).toBe("done");
  });

  test("done is terminal", () => {
    const done: TourState = { beat: "done", gesturePhase: "try" };

    const next = tourReducer(done, { type: "NEXT" });

    expect(next).toEqual(done);
  });
});
