// Pure step machine for the first-run onboarding tour. No DOM and no timers:
// the host translates real events (a user selection, the sheet opening, a track
// preview) into these and renders from the returned state. Staying pure is what
// makes the three beats unit-testable.

export type Beat = "gesture" | "sheet" | "audio" | "done";

export interface TourState {
  beat: Beat;
}

export type TourEvent =
  | { type: "USER_SELECTED" } // the user flung or tapped a country
  | { type: "SHEET_OPENED" } // the user pulled the chart sheet to full
  | { type: "TRACK_PREVIEWED" } // the user tapped a track to preview it
  | { type: "SKIP" }; // dismiss (the X) or Escape

// No auto-demo: the gesture beat opens inviting the user to flick the globe
// themselves, so the tour never moves the globe or changes the selection on the
// user's behalf. A hint, not a scripted motion, teaches the gesture.
export function initialTourState(): TourState {
  return { beat: "gesture" };
}

export function tourReducer(state: TourState, event: TourEvent): TourState {
  // Skip ends the tour from any beat; dismissing counts as seen.
  if (event.type === "SKIP") return { beat: "done" };
  if (state.beat === "done") return state;

  switch (state.beat) {
    case "gesture":
      // Each beat advances only when the user performs its real gesture on the
      // live target under the pass-through dim; there is no tap-to-skip a step.
      // The single exit is the X (SKIP), so the dim never competes with the
      // gesture for the same tap.
      return event.type === "USER_SELECTED" ? { beat: "sheet" } : state;
    case "sheet":
      return event.type === "SHEET_OPENED" ? { beat: "audio" } : state;
    case "audio":
      return event.type === "TRACK_PREVIEWED" ? { beat: "done" } : state;
    default:
      return state;
  }
}
