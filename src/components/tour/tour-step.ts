// Pure step machine for the first-run onboarding tour. No DOM and no timers:
// the host translates real events (a user selection, the sheet opening, a track
// preview) into these and renders from the returned state. Staying pure is what
// makes the three beats unit-testable.

export type Beat = "gesture" | "sheet" | "audio" | "done";

// Only meaningful while beat === "gesture": "try" invites the first flick (hint
// shown, no Next); "ready" appears once the user has flicked, revealing Next so
// they advance when they choose instead of being rushed on by their selection.
export type GesturePhase = "try" | "ready";

export interface TourState {
  beat: Beat;
  gesturePhase: GesturePhase;
}

export type TourEvent =
  | { type: "USER_SELECTED" } // the user flung or tapped a country
  | { type: "SHEET_OPENED" } // the user pulled the chart sheet to full
  | { type: "TRACK_PREVIEWED" } // the user tapped a track to preview it
  | { type: "NEXT" } // the explicit Next control
  | { type: "SKIP" }; // Skip, dismiss, or Escape

// No auto-demo: the gesture beat opens inviting the user to flick the globe
// themselves, so the tour never moves the globe or changes the selection on the
// user's behalf. A hint, not a scripted motion, teaches the gesture.
export function initialTourState(): TourState {
  return { beat: "gesture", gesturePhase: "try" };
}

export function tourReducer(state: TourState, event: TourEvent): TourState {
  // Skip ends the tour from any beat; dismissing counts as seen.
  if (event.type === "SKIP") return { ...state, beat: "done" };
  if (state.beat === "done") return state;

  switch (state.beat) {
    case "gesture":
      // The first flick does not advance; it reveals Next (phase "ready") so the
      // user isn't rushed past the gesture they just learned. Next then advances.
      if (event.type === "USER_SELECTED")
        return { ...state, gesturePhase: "ready" };
      // Next only advances once the user has flicked. The UI already withholds
      // the button until then; the guard keeps the machine honest on its own.
      if (event.type === "NEXT" && state.gesturePhase === "ready")
        return { ...state, beat: "sheet" };
      return state;
    case "sheet":
      return event.type === "SHEET_OPENED" || event.type === "NEXT"
        ? { ...state, beat: "audio" }
        : state;
    case "audio":
      return event.type === "TRACK_PREVIEWED" || event.type === "NEXT"
        ? { ...state, beat: "done" }
        : state;
    default:
      return state;
  }
}
